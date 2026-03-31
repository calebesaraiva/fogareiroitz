import "dotenv/config";
import postgres from "postgres";

const MENU_ID = "3882";
const BASE_URL = "https://appdelivery.menucheff.com/api-appdelivery";
const HOST_URL = "https://appdelivery.menucheff.com";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
});

const repairMojibake = (text) => {
  if (!text) return text;

  if (!/[ÃÂ]|ï¿½|�/.test(text)) {
    return text;
  }

  try {
    return Buffer.from(text, "latin1").toString("utf8");
  } catch {
    return text;
  }
};

const normalizeText = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";

  return repairMojibake(text).replace(/\s+/g, " ").trim();
};

const readJson = async (response) => {
  const buffer = await response.arrayBuffer();
  const source = new TextDecoder("utf-8").decode(buffer);
  return JSON.parse(source);
};

const slugify = (value) =>
  normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140) || "categoria";

const toPriceInCents = (value) => Math.round(Number.parseFloat(value || "0") * 100);

const buildImageUrl = (path, fallbackText) => {
  if (path && path.trim().length > 0) {
    return `${HOST_URL}${path}`;
  }

  const safeText = encodeURIComponent(fallbackText);
  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='100%25' height='100%25' fill='%23f3efe8'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23725a3a' font-family='Arial' font-size='34'>${safeText}</text></svg>`;
};

const ensureSchema = async () => {
  await sql`
    create table if not exists public.categories (
      id bigserial primary key,
      name varchar(120) not null unique,
      slug varchar(140) not null unique,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    )
  `;

  await sql`
    alter table public.products
    add column if not exists "categoryId" bigint references public.categories(id) on delete set null
  `;
};

const [groupResponse, productResponse] = await Promise.all([
  fetch(`${BASE_URL}/GrupoProduto/listar.php?id=${MENU_ID}`),
  fetch(`${BASE_URL}/Produto/listarProdutos.php?id=${MENU_ID}`),
]);

if (!groupResponse.ok || !productResponse.ok) {
  console.error("Failed to download MenuCheff data");
  process.exit(1);
}

const groups = await readJson(groupResponse);
const products = await readJson(productResponse);

await ensureSchema();

await sql`delete from public.products`;
await sql`delete from public.categories`;

const categoryMap = new Map();

for (const group of groups) {
  const name = normalizeText(group.Descricao);
  if (!name) continue;

  const inserted = await sql`
    insert into public.categories (name, slug)
    values (${name}, ${slugify(name)})
    returning id, name
  `;

  categoryMap.set(String(group.Id), inserted[0].id);
}

let importedCount = 0;

for (const product of products) {
  const name = normalizeText(product.Descricao);
  if (!name) continue;

  const categoryId = categoryMap.get(String(product.Grupo)) ?? null;
  const description = normalizeText(product.Composicao) || null;
  const imageUrl = buildImageUrl(product.Imagem, name);
  const isActive = String(product.Disponivel) === "True" && String(product.ProdutoAtivo) === "True";
  const price = toPriceInCents(product.PrecoVenda);

  await sql`
    insert into public.products (
      "categoryId",
      name,
      description,
      price,
      "imageUrl",
      ingredients,
      "isActive"
    )
    values (
      ${categoryId},
      ${name},
      ${description},
      ${price},
      ${imageUrl},
      ${description},
      ${isActive}
    )
  `;

  importedCount += 1;
}

console.log(
  JSON.stringify(
    {
      categories: categoryMap.size,
      products: importedCount,
    },
    null,
    2
  )
);

await sql.end({ timeout: 5 });
