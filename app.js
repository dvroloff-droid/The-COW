document.documentElement.classList.add("has-js");

const menuButton = document.querySelector(".nav-toggle");
const primaryNav = document.querySelector("#primary-nav");
const year = document.querySelector("#year");

if (year) {
  year.textContent = String(new Date().getFullYear());
}

if (menuButton && primaryNav) {
  const closeMenu = () => {
    menuButton.setAttribute("aria-expanded", "false");
    primaryNav.classList.remove("is-open");
  };

  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    primaryNav.classList.toggle("is-open", !isOpen);
  });

  primaryNav.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
}
