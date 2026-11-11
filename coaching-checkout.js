for (const [key, id] of [["single", "single"], ["package", "package"]]) {
  const link = document.getElementById(`${id}-checkout`);
  const unavailable = document.getElementById(`${id}-unavailable`);
  const value = window.coachingCheckoutLinks?.[key];

  if (!link || !unavailable || !value) continue;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.host !== "buy.stripe.com" || url.pathname === "/" || url.username || url.password) {
      throw new Error("Expected an HTTPS Stripe Payment Link");
    }
    link.href = url.href;
    link.hidden = false;
    unavailable.hidden = true;
  } catch (error) {
    console.error(`Invalid Stripe Payment Link for ${key}:`, error);
  }
}
