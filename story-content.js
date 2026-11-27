window.COACH_THOUGHTS_STORIES = (() => {
  const sports = ["baseball", "football", "basketball", "hockey", "soccer"];

  const parseStoryArticle = (text, fileName) => {
    const isJsonStory = fileName.toLowerCase().endsWith(".json");
    let article;
    try {
      article = JSON.parse(text);
    } catch (error) {
      if (isJsonStory) throw error;
      return null;
    }
    if (
      article &&
      typeof article.title === "string" &&
      typeof article.html === "string"
    ) {
      return {
        ...article,
        sport: sports.includes(article.sport) ? article.sport : "",
      };
    }
    if (isJsonStory) {
      throw new Error("The published column has an invalid format.");
    }
    return null;
  };

  const parsePlainStory = (text) => {
    const lines = text.split(/\r?\n/);
    const titleIndex = lines.findIndex((line) => line.trim());
    return {
      title: titleIndex < 0 ? "Untitled story" : lines[titleIndex].trim(),
      paragraphs: titleIndex < 0
        ? []
        : lines.slice(titleIndex + 1).join("\n").trim().split(/\n\s*\n/).filter(Boolean),
    };
  };

  const appendSafeStoryNodes = (source, target, supabaseUrl, bucketName) => {
    const allowedTags = new Set([
      "A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "FIGCAPTION", "FIGURE",
      "CAPTION", "FONT", "H2", "H3", "I", "IMG", "LI", "OL", "P", "S", "SPAN", "STRONG",
      "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "U", "UL",
    ]);
    const blockedTags = new Set(["IFRAME", "OBJECT", "SCRIPT", "STYLE", "SVG"]);
    for (const child of source.childNodes) {
      if (child.nodeType === 3) {
        target.append(document.createTextNode(child.textContent));
        continue;
      }
      if (child.nodeType !== 1 || blockedTags.has(child.tagName)) continue;
      if (child.tagName === "IMG") {
        const sourceUrl = child.getAttribute("src");
        if (!sourceUrl) continue;
        try {
          const imageUrl = new URL(sourceUrl, supabaseUrl);
          const storagePath = `/storage/v1/object/public/${bucketName}/story-images/`;
          if (
            imageUrl.origin !== new URL(supabaseUrl).origin ||
            !imageUrl.pathname.startsWith(storagePath)
          ) {
            continue;
          }
          const image = document.createElement("img");
          image.src = imageUrl.href;
          image.alt = child.getAttribute("alt") || "";
          target.append(image);
        } catch {
          continue;
        }
        continue;
      }

      if (!allowedTags.has(child.tagName)) {
        appendSafeStoryNodes(child, target, supabaseUrl, bucketName);
        continue;
      }
      const tagName = child.tagName === "DIV" ? "p"
        : child.tagName === "FONT" ? "span"
        : child.tagName.toLowerCase();
      const element = document.createElement(tagName);
      if (child.tagName === "TD" || child.tagName === "TH") {
        for (const attribute of ["colspan", "rowspan"]) {
          const value = child.getAttribute(attribute);
          if (/^[1-9]\d{0,2}$/.test(value || "") && Number(value) <= 100) {
            element.setAttribute(attribute, value);
          }
        }
        const scope = child.getAttribute("scope");
        if (child.tagName === "TH" && ["row", "col", "rowgroup", "colgroup"].includes(scope)) {
          element.setAttribute("scope", scope);
        }
      }
      const fontSize = child.style?.fontSize || "";
      const sizeMatch = /^(\d+(?:\.\d+)?)(pt|px|em|rem|%)$/.exec(fontSize);
      if (sizeMatch) {
        const size = Number(sizeMatch[1]);
        const limits = { pt: [5, 72], px: [6, 96], em: [0.4, 4], rem: [0.4, 4], "%": [40, 400] };
        const [min, max] = limits[sizeMatch[2]];
        if (size >= min && size <= max) element.style.fontSize = fontSize;
      }
      if (child.tagName === "A") {
        const href = child.getAttribute("href");
        if (href) {
          try {
            const linkUrl = new URL(href, window.location.href);
            if (linkUrl.protocol === "https:" || linkUrl.protocol === "http:") {
              element.href = linkUrl.href;
              element.target = "_blank";
              element.rel = "noopener noreferrer";
            }
          } catch {
            // Render the link label without an unsafe destination.
          }
        }
      }
      appendSafeStoryNodes(child, element, supabaseUrl, bucketName);
      target.append(element);
    }
  };

  const attachRedCardCaption = (body) => {
    const caption = Array.from(body.querySelectorAll("p, figcaption, h2, h3, a, span"))
      .find((element) =>
        !element.querySelector("img") &&
        /^["“]?\s*is this worth a red card\?\s*[-–—]\s*threads\s*["”]?$/i.test(
          element.textContent.trim().replace(/\s+/g, " "),
        ));
    if (!caption) return;

    const image = Array.from(body.querySelectorAll("img"))
      .filter((element) => element.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING)
      .pop();
    if (!image) return;
    let figure = image.closest("figure");
    if (figure?.contains(caption)) return;
    if (figure?.querySelector("figcaption")) return;
    if (!figure) {
      const link = image.closest("a");
      const imageNode = link && link.textContent.trim() === "" ? link : image;
      const paragraph = imageNode.closest("p");
      const position = paragraph || imageNode;
      figure = document.createElement("figure");
      position.before(figure);
      figure.append(imageNode);
      if (paragraph && !paragraph.textContent.trim() && !paragraph.querySelector("img")) paragraph.remove();
    }

    const figcaption = document.createElement("figcaption");
    if (caption.tagName === "A") {
      figcaption.append(caption);
    } else {
      while (caption.firstChild) figcaption.append(caption.firstChild);
      caption.remove();
    }
    figure.append(figcaption);
  };

  return { sports, parseStoryArticle, parsePlainStory, appendSafeStoryNodes, attachRedCardCaption };
})();
