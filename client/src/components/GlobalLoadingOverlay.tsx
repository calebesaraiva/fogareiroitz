type GlobalLoadingOverlayProps = {
  visible: boolean;
  message?: string;
};

export default function GlobalLoadingOverlay({
  visible,
  message = "Feliz Dia das Maes",
}: GlobalLoadingOverlayProps) {
  const restaurantName =
    import.meta.env.VITE_APP_TITLE || "Fogareiro ITZ Restaurante";
  const restaurantLogo = import.meta.env.VITE_APP_LOGO || "/fogareiro-logo.png";

  return (
    <div
      className={`global-loading-overlay ${visible ? "is-visible" : ""}`}
      aria-hidden={!visible}
    >
      <div className="global-loading-backdrop" />
      <div className="global-loading-petals" aria-hidden="true">
        <span className="petal petal-1" />
        <span className="petal petal-2" />
        <span className="petal petal-3" />
        <span className="petal petal-4" />
        <span className="petal petal-5" />
        <span className="petal petal-6" />
        <span className="petal petal-7" />
        <span className="petal petal-8" />
      </div>
      <div className="global-loading-panel">
        <div className="global-loading-glow" />
        <div className="global-loading-rose" aria-hidden="true">
          <span className="rose-petal rose-petal-1" />
          <span className="rose-petal rose-petal-2" />
          <span className="rose-petal rose-petal-3" />
          <span className="rose-petal rose-petal-4" />
          <span className="rose-core" />
        </div>
        <div className="global-loading-logo-shell">
          <img
            src={restaurantLogo}
            alt={restaurantName}
            className="global-loading-logo"
          />
        </div>
        <p className="global-loading-kicker">Fogareiro ITZ Restaurante</p>
        <h2 className="global-loading-title">{message}</h2>
        <div className="global-loading-mark">
          <div className="global-loading-mark-ring" />
          <img
            src={restaurantLogo}
            alt={restaurantName}
            className="global-loading-mark-logo"
          />
        </div>
        <div className="global-loading-progress" role="progressbar" aria-valuetext="Carregando">
          <span />
        </div>
      </div>
    </div>
  );
}
