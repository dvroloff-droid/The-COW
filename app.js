document.getElementById("year").textContent = new Date().getFullYear();

document.querySelectorAll('[data-action="placeholder"]').forEach((button) => {
  button.addEventListener("click", () => {
    alert("This section is coming soon.");
  });
});

document.querySelectorAll('[data-action="external-placeholder"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    alert("This link has not been set up yet.");
  });
});
