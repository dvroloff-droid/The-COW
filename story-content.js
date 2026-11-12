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
      "H2", "H3", "I", "IMG", "LI", "OL", "P", "S", "STRONG", "U", "UL",
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
      const tagName = child.tagName === "DIV" ? "p" : child.tagName.toLowerCase();
      const element = document.createElement(tagName);
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

  return { sports, parseStoryArticle, parsePlainStory, appendSafeStoryNodes };
})();
