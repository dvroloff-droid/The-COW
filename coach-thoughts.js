(() => {
  const bucketName = "coach-thoughts";
  const maxFileSize = 20 * 1024 * 1024;
  const config = window.COACH_THOUGHTS_CONFIG;
  const status = document.querySelector("#thoughts-status");
  const loginForm = document.querySelector("#thoughts-login");
  const resetRequestButton = document.querySelector("#thoughts-reset-request");
  const resetForm = document.querySelector("#thoughts-reset");
  const uploadArea = document.querySelector("#thoughts-uploader");
  const spreadsheetForm = document.querySelector("#thoughts-spreadsheet");
  const spreadsheetInput = document.querySelector("#thoughts-spreadsheet-file");
  const spreadsheetStatus = document.querySelector("#thoughts-spreadsheet-status");
  const storyForm = document.querySelector("#thoughts-story");
  const storySubmitButton = storyForm.querySelector('button[type="submit"]');
  const storyTitleInput = document.querySelector("#thoughts-story-title");
  const storyEditor = document.querySelector("#thoughts-story-editor");
  const storyImageButton = document.querySelector("#thoughts-story-add-image");
  const storyImageInput = document.querySelector("#thoughts-story-image");
  const storyAgainButton = document.querySelector("#thoughts-story-again");
  const storyStatus = document.querySelector("#thoughts-story-status");
  const signOutButton = document.querySelector("#thoughts-signout");
  const fileList = document.querySelector("#thoughts-list");
  const gfflWorkbooks = document.querySelector("#gffl-workbooks");
  const heroInner = document.querySelector(".hero-inner");

  let statusRevision = 0;
  const updateStatus = (element, message) => {
    element.textContent = message;
    element.dataset.state = /could not|choose|enter|add article|add a headline|couldn't|unable to verify/i.test(message)
      ? "error"
      : /successfully|picture added|published/i.test(message)
        ? "success"
        : "info";
  };
  const setStatus = (message) => {
    statusRevision++;
    updateStatus(status, message);
  };
  const setSpreadsheetStatus = (message) => updateStatus(spreadsheetStatus, message);
  const setStoryStatus = (message) => updateStatus(storyStatus, message);
  const storyEditButtons = new Set();
  let editingStoryName = null;
  let activeSession = null;
  const workbookKey = (name) => name
    .replace(/^[0-9a-f-]{36}-/i, "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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
      return article;
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
  const setWorkbookMessage = (message) => {
    const item = document.createElement("li");
    item.textContent = message;
    gfflWorkbooks.replaceChildren(item);
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

  const showSetupInstructions = () => {
    setStatus("Connect a Supabase project to enable file uploads. See the setup instructions.");
    setWorkbookMessage("Connect Supabase to load GFFL workbooks.");
    fileList.replaceChildren();
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = "README.md";
    link.textContent = "Supabase setup instructions";
    item.append(link);
    fileList.append(item);
  };

  if (
    !config?.supabaseUrl ||
    !config?.supabaseAnonKey ||
    config.supabaseUrl.startsWith("YOUR_") ||
    config.supabaseAnonKey.startsWith("YOUR_")
  ) {
    showSetupInstructions();
    return;
  }

  const initializeUploader = () => {
    if (!window.supabase?.createClient) {
      setStatus("The Supabase client could not be loaded. Check your connection and refresh.");
      setWorkbookMessage("Could not load GFFL workbooks. Check your connection and refresh.");
      return;
    }

    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    let recoveryMode = hashParams.get("type") === "recovery";
    const recoveryError = hashParams.get("error_description");
    const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const bucket = client.storage.from(bucketName);
    let savedStorySelection = null;
    let pictureUploadPending = false;
    let storySavePending = false;

    const readStory = async (name) => {
      const url = new URL(bucket.getPublicUrl(name).data.publicUrl);
      url.searchParams.set("version", crypto.randomUUID());
      const response = await fetch(url.href, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`The shared story could not be read (HTTP ${response.status}).`);
      }
      return response.text();
    };

    const showError = (action, error, report = setStatus) => {
      const details =
        error && typeof error.message === "string"
          ? error.message
          : "An unexpected error occurred.";
      report(`${action}: ${details}`);
    };

    const showSession = (session) => {
      activeSession = session;
      loginForm.hidden = Boolean(session);
      resetForm.hidden = !session || !recoveryMode;
      uploadArea.hidden = !session || recoveryMode;
      for (const button of storyEditButtons) button.hidden = !session || recoveryMode;
    };

    const loadFiles = async (preserveStatus = false, openStoryName = null) => {
      const startingRevision = statusRevision;
      heroInner.classList.remove("newspaper-reading");
      fileList.replaceChildren();
      gfflWorkbooks.replaceChildren();
      try {
        const { data, error } = await bucket.list("", {
          limit: 100,
          sortBy: { column: "created_at", order: "desc" },
        });

        if (error) {
          showError("Could not load shared files", error);
          setWorkbookMessage("Could not load GFFL workbooks. Refresh the page to retry.");
          return false;
        }

        const files = (data || []).filter((file) => file.id);
        const latestWorkbooks = new Map();
        for (const file of files) {
          if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) continue;
          const workbookName = workbookKey(file.name);
          const current = latestWorkbooks.get(workbookName);
          const fileCreatedAt = Date.parse(file.created_at || "");
          const currentCreatedAt = Date.parse(current?.created_at || "");
          if (
            !current ||
            (Number.isFinite(fileCreatedAt) &&
              (!Number.isFinite(currentCreatedAt) || fileCreatedAt > currentCreatedAt))
          ) {
            latestWorkbooks.set(workbookName, file);
          }
        }
        const storyToOpenName = openStoryName ||
          files.find((file) => file.name.startsWith("story-"))?.name;
        if (files.length === 0) {
          if (!preserveStatus && statusRevision === startingRevision) {
            setStatus("No files or stories have been shared yet.");
          }
          const item = document.createElement("li");
          item.textContent = "Your shared files and stories will appear here.";
          fileList.append(item);
          const workbookItem = document.createElement("li");
          workbookItem.textContent = "GFFL workbooks will appear here.";
          gfflWorkbooks.append(workbookItem);
          return !openStoryName;
        }

        let openedStory = null;
        let archiveItemCount = 0;
        let workbookCount = 0;
        for (const file of files) {
          const item = document.createElement("li");
          if (file.name.startsWith("story-")) {
            const details = document.createElement("details");
            const summary = document.createElement("summary");
            const storyArticle = document.createElement("article");
            const storyHeader = document.createElement("header");
            const storyEyebrow = document.createElement("p");
            const storyTitle = document.createElement("h3");
            const storyBody = document.createElement("div");
            const storyEditButton = document.createElement("button");
            let loaded = false;
            let loading = false;
            storyArticle.className = "shared-story-article";
            storyEyebrow.className = "eyebrow";
            storyEyebrow.textContent = "COACH'S NOTEBOOK";
            storyHeader.className = "shared-story-header";
            storyBody.className = "shared-story-body";
            if (/\.(json|txt)$/i.test(file.name)) {
              storyEditButton.className = "story-edit-button";
              storyEditButton.type = "button";
              storyEditButton.textContent = "Edit article";
              storyEditButton.hidden = !activeSession || recoveryMode;
              storyEditButtons.add(storyEditButton);
            }
            summary.textContent = file.name
              .replace(/^story-[0-9a-f-]{36}-/i, "")
              .replace(/\.(txt|json)$/i, "")
              .replace(/-/g, " ") || "Read shared story";
            storyHeader.append(storyEyebrow, storyTitle);
            if (/\.(json|txt)$/i.test(file.name)) storyHeader.append(storyEditButton);
            storyArticle.append(storyHeader, storyBody);
            details.append(summary, storyArticle);
            details.addEventListener("toggle", async () => {
              if (details.open) {
                for (const otherDetails of fileList.querySelectorAll("details[open]")) {
                  if (otherDetails !== details) otherDetails.open = false;
                }
                heroInner.classList.add("newspaper-reading");
              } else if (!fileList.querySelector("details[open]")) {
                heroInner.classList.remove("newspaper-reading");
              }
              if (!details.open || loaded || loading) return;
              loading = true;
              storyBody.textContent = "Loading story...";
              try {
                const text = await readStory(file.name);
                const article = parseStoryArticle(text, file.name);
                if (article) {
                  storyTitle.textContent = article.title;
                  summary.textContent = article.title;
                  const parsed = new DOMParser().parseFromString(article.html, "text/html");
                  storyBody.replaceChildren();
                  appendSafeStoryNodes(parsed.body, storyBody, config.supabaseUrl, bucketName);
                } else {
                  const { title, paragraphs } = parsePlainStory(text);
                  storyTitle.textContent = title;
                  storyBody.replaceChildren();
                  for (const paragraph of paragraphs) {
                    const paragraphElement = document.createElement("p");
                    paragraphElement.textContent = paragraph.trim();
                    storyBody.append(paragraphElement);
                  }
                }
                loaded = true;
              } catch (error) {
                showError("Could not load shared story", error);
                storyBody.textContent = "Could not load this story. Open it again to retry.";
              } finally {
                loading = false;
              }
            });
            if (/\.(json|txt)$/i.test(file.name)) {
              storyEditButton.addEventListener("click", async () => {
                storyEditButton.disabled = true;
                setStoryStatus("Loading article for editing...");
                try {
                  const text = await readStory(file.name);
                  const article = parseStoryArticle(text, file.name);
                  storyEditor.replaceChildren();
                  if (article) {
                    storyTitleInput.value = article.title;
                    const parsed = new DOMParser().parseFromString(article.html, "text/html");
                    appendSafeStoryNodes(parsed.body, storyEditor, config.supabaseUrl, bucketName);
                  } else {
                    const legacyStory = parsePlainStory(text);
                    storyTitleInput.value = legacyStory.title;
                    for (const paragraph of legacyStory.paragraphs) {
                      const paragraphElement = document.createElement("p");
                      paragraphElement.textContent = paragraph.trim();
                      storyEditor.append(paragraphElement);
                    }
                  }
                  editingStoryName = file.name;
                  storyForm.hidden = false;
                  storyAgainButton.hidden = false;
                  storyAgainButton.textContent = "Cancel editing";
                  storySubmitButton.textContent = "Save changes";
                  setStoryStatus("Edit the article, add pictures, and save your changes.");
                } catch (error) {
                  showError("Could not edit article", error, setStoryStatus);
                } finally {
                  storyEditButton.disabled = false;
                }
              });
            }
            details.open = file.name === storyToOpenName;
            if (details.open) {
              heroInner.classList.add("newspaper-reading");
              openedStory = details;
            }
            item.append(details);
          } else {
            const link = document.createElement("a");
            link.href = bucket.getPublicUrl(file.name, { download: true }).data.publicUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = file.name.replace(/^[0-9a-f-]{36}-/i, "");
            item.append(link);
          }
          if (/\.(xlsx|xls|xlsm)$/i.test(file.name)) {
            const workbookName = workbookKey(file.name);
            if (latestWorkbooks.get(workbookName) === file) {
              gfflWorkbooks.append(item);
              workbookCount++;
            }
          } else {
            fileList.append(item);
            archiveItemCount++;
          }
        }
        if (archiveItemCount === 0) {
          const item = document.createElement("li");
          item.textContent = "No articles or other shared files have been published.";
          fileList.append(item);
        }
        if (workbookCount === 0) {
          const item = document.createElement("li");
          item.textContent = "GFFL workbooks will appear here.";
          gfflWorkbooks.append(item);
        }

        if (!preserveStatus && statusRevision === startingRevision) {
          setStatus(`${files.length} shared item${files.length === 1 ? "" : "s"}.`);
        }
        if (openStoryName && openedStory) {
          openedStory.scrollIntoView({ block: "start", behavior: "smooth" });
        }
        return !openStoryName || Boolean(openedStory);
      } catch (error) {
        showError("Could not load shared files", error);
        setWorkbookMessage("Could not load GFFL workbooks. Refresh the page to retry.");
        return false;
      }
    };

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = loginForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      setStatus("Signing in...");

      try {
        const formData = new FormData(loginForm);
        const { error } = await client.auth.signInWithPassword({
          email: formData.get("email"),
          password: formData.get("password"),
        });

        if (error) {
          showError("Could not sign in", error);
          return;
        }

        setStatus("Signed in. You can share files and stories.");
      } catch (error) {
        showError("Could not sign in", error);
      } finally {
        submitButton.disabled = false;
      }
    });

    spreadsheetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const workbook = spreadsheetInput.files?.[0];
      if (!workbook) {
        setSpreadsheetStatus("Choose an Excel workbook to share.");
        spreadsheetInput.focus();
        return;
      }

      const extension = workbook.name.match(/\.(xlsx|xls|xlsm)$/i)?.[1].toLowerCase();
      if (!extension) {
        setSpreadsheetStatus("Choose an .xlsx, .xls, or .xlsm workbook.");
        spreadsheetInput.focus();
        return;
      }
      if (!workbook.size) {
        setSpreadsheetStatus("Choose a non-empty Excel workbook.");
        spreadsheetInput.focus();
        return;
      }
      if (workbook.size > maxFileSize) {
        setSpreadsheetStatus("Choose a workbook no larger than 20 MB.");
        return;
      }

      const contentTypes = {
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        xls: "application/vnd.ms-excel",
        xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
      };
      const safeName = workbook.name
        .normalize("NFKC")
        .replace(/[^\w.-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const objectName = `${crypto.randomUUID()}-${safeName || `workbook.${extension}`}`;
      const submitButton = spreadsheetForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      setSpreadsheetStatus("Uploading workbook...");

      try {
        const { error } = await bucket.upload(objectName, workbook, {
          cacheControl: "3600",
          contentType: contentTypes[extension],
          upsert: false,
        });
        if (error) {
          showError("Could not share workbook", error, setSpreadsheetStatus);
          return;
        }

        spreadsheetForm.reset();
        const refreshed = await loadFiles(true);
        setSpreadsheetStatus(refreshed
          ? "Workbook shared successfully. Its public download link is under The GFFL."
          : "Workbook uploaded, but The GFFL list couldn't refresh. Reload the page to find it.");
      } catch (error) {
        showError("Could not share workbook", error, setSpreadsheetStatus);
      } finally {
        submitButton.disabled = false;
      }
    });

    storyForm.querySelectorAll("[data-command]").forEach((button) => {
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        storyEditor.focus();
        document.execCommand(button.dataset.command, false, button.dataset.value || null);
      });
    });

    storyImageButton.addEventListener("mousedown", (event) => event.preventDefault());
    storyImageButton.addEventListener("click", () => {
      const selection = window.getSelection();
      if (selection?.rangeCount && storyEditor.contains(selection.anchorNode)) {
        savedStorySelection = selection.getRangeAt(0).cloneRange();
      }
      storyImageInput.click();
    });

    const uploadStoryImage = async (image, selectionRange = savedStorySelection) => {
      if (!image.type.startsWith("image/")) {
        setStoryStatus("Choose an image file.");
        return;
      }
      if (image.size > maxFileSize) {
        setStoryStatus("Choose an image no larger than 20 MB.");
        return;
      }

      setStoryStatus("Uploading picture...");
      try {
        const safeName = image.name
          .normalize("NFKC")
          .replace(/[^\w.-]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const imageName = `story-images/${crypto.randomUUID()}-${safeName || "picture"}`;
        const { error } = await bucket.upload(imageName, image, {
          cacheControl: "3600",
          contentType: image.type,
          upsert: false,
        });
        if (error) {
          showError("Could not upload picture", error, setStoryStatus);
          return;
        }

        const imageElement = document.createElement("img");
        imageElement.src = bucket.getPublicUrl(imageName).data.publicUrl;
        imageElement.alt = image.name;
        const figure = document.createElement("figure");
        figure.append(imageElement);
        storyEditor.focus();
        const selection = window.getSelection();
        if (
          selectionRange &&
          storyEditor.contains(selectionRange.commonAncestorContainer) &&
          selection
        ) {
          selection.removeAllRanges();
          selection.addRange(selectionRange);
          selectionRange.deleteContents();
          selectionRange.insertNode(figure);
          selectionRange.setStartAfter(figure);
          selectionRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(selectionRange);
          savedStorySelection = selectionRange.cloneRange();
        } else {
          storyEditor.append(figure);
          savedStorySelection = null;
        }
        setStoryStatus("Picture added to your column.");
      } catch (error) {
        showError("Could not upload picture", error, setStoryStatus);
      }
    };

    const uploadStoryImages = async (images) => {
      if (pictureUploadPending || storySavePending) {
        setStoryStatus("Wait for the current operation to finish.");
        return;
      }
      pictureUploadPending = true;
      storyImageButton.disabled = true;
      storySubmitButton.disabled = true;
      storyAgainButton.disabled = true;
      for (const button of storyEditButtons) button.disabled = true;
      try {
        for (const image of images) {
          await uploadStoryImage(image);
        }
      } finally {
        pictureUploadPending = false;
        storyImageButton.disabled = false;
        storySubmitButton.disabled = false;
        storyAgainButton.disabled = false;
        for (const button of storyEditButtons) button.disabled = false;
      }
    };

    storyEditor.addEventListener("paste", async (event) => {
      const images = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter(Boolean);
      if (!images.length) return;
      event.preventDefault();
      const selection = window.getSelection();
      savedStorySelection = selection?.rangeCount &&
        storyEditor.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;
      await uploadStoryImages(images);
    });

    storyImageInput.addEventListener("change", async () => {
      const image = storyImageInput.files?.[0];
      storyImageInput.value = "";
      if (!image) return;
      await uploadStoryImages([image]);
    });

    storyAgainButton.addEventListener("click", () => {
      if (editingStoryName) {
        editingStoryName = null;
        storyForm.reset();
        storyEditor.replaceChildren();
        storySubmitButton.textContent = "Publish story";
      }
      storyForm.hidden = false;
      storyAgainButton.hidden = true;
      storyAgainButton.textContent = "Write another article";
      setStoryStatus("");
      storyTitleInput.focus();
    });

    storyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (storySavePending) return;
      if (pictureUploadPending) {
        setStoryStatus("Wait for the current picture upload to finish before saving.");
        return;
      }
      const storyTitle = storyTitleInput.value.trim();
      const storyHtml = storyEditor.innerHTML.trim();
      if (!storyTitle) {
        setStoryStatus("Enter a headline before publishing your article.");
        storyTitleInput.focus();
        return;
      }
      if (!storyEditor.textContent.trim() && !storyEditor.querySelector("img")) {
        setStoryStatus("Add article text or a picture before publishing.");
        storyEditor.focus();
        return;
      }

      const storyFile = new Blob(
        [JSON.stringify({ title: storyTitle, html: storyHtml })],
        { type: "application/json;charset=utf-8" },
      );
      if (storyFile.size > maxFileSize) {
        setStoryStatus("Choose a story no larger than 20 MB.");
        return;
      }

      const publishButton = storySubmitButton;
      storySavePending = true;
      publishButton.disabled = true;
      storyImageButton.disabled = true;
      storyAgainButton.disabled = true;
      storyEditor.contentEditable = "false";
      storyForm.querySelectorAll("[data-command]").forEach((button) => { button.disabled = true; });
      for (const button of storyEditButtons) button.disabled = true;
      setStoryStatus("Publishing your article...");

      try {
        const safeTitle = storyTitle
          ?.normalize("NFKC")
          .replace(/[^\w.-]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const objectName = editingStoryName ||
          `story-${crypto.randomUUID()}-${safeTitle || "untitled"}.json`;
        const wasEditing = Boolean(editingStoryName);
        const { error } = await bucket.upload(objectName, storyFile, {
          cacheControl: "0",
          contentType: "application/json;charset=utf-8",
          upsert: wasEditing,
        });

        if (error) {
          showError(
            wasEditing ? "Could not update article" : "Could not publish story",
            error,
            setStoryStatus,
          );
          return;
        }

        editingStoryName = objectName;
        storySubmitButton.textContent = "Save changes";
        try {
          if (await readStory(objectName) !== await storyFile.text()) {
            throw new Error("The published copy does not match your changes yet.");
          }
        } catch (error) {
          showError("Changes uploaded, but unable to verify them. Your draft is still here", error, setStoryStatus);
          return;
        }

        storyForm.reset();
        storyEditor.replaceChildren();
        storySubmitButton.textContent = "Publish story";
        editingStoryName = null;
        storyForm.hidden = true;
        storyAgainButton.hidden = false;
        storyAgainButton.textContent = "Write another article";
        setStoryStatus(wasEditing
          ? "Saving article changes. Opening the updated article..."
          : "Article published successfully. Opening your article...");
        const refreshed = await loadFiles(true, objectName);
        setStoryStatus(refreshed
          ? wasEditing ? "Article updated successfully." : "Article published successfully."
          : wasEditing
            ? "Article saved, but it couldn't be opened in the shared list. Reload the page to find it."
            : "Article published, but it couldn't be opened in the shared list. Reload the page to find it.");
      } catch (error) {
        showError(
          editingStoryName ? "Could not update article" : "Could not publish story",
          error,
          setStoryStatus,
        );
      } finally {
        storySavePending = false;
        publishButton.disabled = false;
        storyImageButton.disabled = false;
        storyAgainButton.disabled = false;
        storyEditor.contentEditable = "true";
        storyForm.querySelectorAll("[data-command]").forEach((button) => { button.disabled = false; });
        for (const button of storyEditButtons) button.disabled = false;
      }
    });

    resetRequestButton.addEventListener("click", async () => {
      const emailInput = loginForm.querySelector('input[name="email"]');
      if (!emailInput.reportValidity()) return;

      resetRequestButton.disabled = true;
      setStatus("Sending password reset link...");
      try {
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        const { error } = await client.auth.resetPasswordForEmail(emailInput.value.trim(), { redirectTo });
        if (error) {
          showError("Could not send password reset link", error);
          return;
        }
        setStatus("If this email has an account, check its inbox for a password reset link.");
      } catch (error) {
        showError("Could not send password reset link", error);
      } finally {
        resetRequestButton.disabled = false;
      }
    });

    resetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(resetForm);
      const password = formData.get("password");
      if (password !== formData.get("confirmation")) {
        setStatus("The new passwords do not match.");
        return;
      }

      const submitButton = resetForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      setStatus("Updating password...");
      try {
        const { error } = await client.auth.updateUser({ password });
        if (error) {
          showError("Could not update password", error);
          return;
        }
        recoveryMode = false;
        resetForm.reset();
        showSession(true);
        setStatus("Password updated. You can now share files and stories.");
      } catch (error) {
        showError("Could not update password", error);
      } finally {
        submitButton.disabled = false;
      }
    });

    signOutButton.addEventListener("click", async () => {
      try {
        const { error } = await client.auth.signOut();
        if (error) {
          showError("Could not sign out", error);
          return;
        }
        setStatus("You are signed out. Shared files remain available to download.");
      } catch (error) {
        showError("Could not sign out", error);
      }
    });

    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryMode = true;
        setStatus("Enter a new password below.");
      }
      if (event === "SIGNED_OUT") recoveryMode = false;
      showSession(session);
    });
    const initialStatusRevision = statusRevision;
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          showError("Could not check sign-in status", error);
          return;
        }
        showSession(data.session);
        if (recoveryError) {
          setStatus(`Password reset link error: ${recoveryError}. Request a new link.`);
        } else if (recoveryMode && data.session) {
          setStatus("Enter a new password below.");
        }
        loadFiles(Boolean(recoveryError) || recoveryMode || statusRevision !== initialStatusRevision);
      })
      .catch((error) => showError("Could not check sign-in status", error));
  };

  if (window.supabase?.createClient) {
    initializeUploader();
    return;
  }

  const sdk = document.createElement("script");
  sdk.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  sdk.async = true;
  sdk.onload = initializeUploader;
  sdk.onerror = () => setStatus("Could not load the Supabase client. Check your connection and refresh.");
  document.head.append(sdk);
})();
