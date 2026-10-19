// Hover-Effekt: solange man über eine Option schwebt, bekommt der ganze
// Bildschirm einen leichten Farbton der jeweiligen Sektion. Reine Optik,
// verschwindet wieder, sobald die Maus die Karte verlässt.
(function () {
  const body = document.body;
  const wash = document.querySelector(".hub-wash");
  const options = document.querySelectorAll(".hub-option");

  options.forEach((el) => {
    const accent = el.dataset.accent;
    const enter = () => {
      body.classList.add("hub-hovering");
      wash.style.setProperty("--accent", `var(--accent-${accent})`);
      const r = el.getBoundingClientRect();
      wash.style.setProperty("--wash-x", `${r.left + r.width / 2}px`);
      wash.style.setProperty("--wash-y", `${r.top + r.height / 2}px`);
    };
    const leave = () => body.classList.remove("hub-hovering");
    el.addEventListener("mouseenter", enter);
    el.addEventListener("focus", enter);
    el.addEventListener("mouseleave", leave);
    el.addEventListener("blur", leave);
  });
})();
