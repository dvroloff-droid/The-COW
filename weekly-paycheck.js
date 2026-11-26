(() => {
  const config = window.COACH_THOUGHTS_CONFIG;
  const folder = "story-weekly-paycheck";
  const ownerMode = window.location.hash === "#coach-login";
  const login = document.querySelector("#paycheck-login");
  const email = document.querySelector("#paycheck-email");
  const password = document.querySelector("#paycheck-password");
  const author = document.querySelector("#paycheck-author");
  const form = document.querySelector("#paycheck-form");
  const title = document.querySelector("#paycheck-title");
  const file = document.querySelector("#paycheck-file");
  const submit = document.querySelector("#paycheck-submit");
  const cancel = document.querySelector("#paycheck-cancel");
  const signout = document.querySelector("#paycheck-signout");
  const heading = document.querySelector("#paycheck-form-heading");
  const editorStatus = document.querySelector("#paycheck-editor-status");
  const status = document.querySelector("#paycheck-status");
  const list = document.querySelector("#paycheck-list");
  let signedIn = false;
  let editingName = null;
  let saving = false;
  let editingFileName = null;
  let editingFileType = null;
  let loadRevision = 0;
  let client;
  let bucket;

  const errorMessage = (error) => error?.message || "An unexpected error occurred.";
  const allowedTypes = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };

  const parseCells = (text) => {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (char === '"') {
          quoted = false;
        } else {
          cell += char;
        }
      } else if (char === '"' && cell === "") {
        quoted = true;
      } else if (char === "\t") {
        row.push(cell);
        cell = "";
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    if (quoted) throw new Error("A quoted spreadsheet cell is incomplete. Copy and paste the cells again.");
    if (cell || row.length || !rows.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  };

  const resetEditor = () => {
    editingName = null;
    editingFileName = null;
    editingFileType = null;
    form.reset();
    heading.textContent = "Post a spreadsheet PDF or snip";
    submit.textContent = "Publish update";
    file.required = true;
    cancel.hidden = true;
  };

  const setSession = (session) => {
    signedIn = Boolean(session) && ownerMode;
    login.hidden = !ownerMode || signedIn;
    author.hidden = !signedIn;
    for (const button of list.querySelectorAll(".paycheck-edit, .paycheck-delete")) {
      button.hidden = !signedIn;
    }
  };

  const readPost = async (name) => {
    const url = new URL(bucket.getPublicUrl(`${folder}/${name}`).data.publicUrl);
    url.searchParams.set("version", crypto.randomUUID());
    const response = await fetch(url.href, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not read the table (HTTP ${response.status}).`);
    return response.text();
  };

  const renderPost = (post, name) => {
    const item = document.createElement("li");
    const article = document.createElement("article");
    const postTitle = document.createElement("h3");
    const edit = document.createElement("button");
    const remove = document.createElement("button");
    article.className = "paycheck-post";
    postTitle.textContent = post.title;
    let content;
    const fileName = post.type === "pdf" ? post.pdfName : post.fileName;
    const fileType = post.type === "pdf" ? "application/pdf" : post.fileType;
    if (fileName && fileType) {
      const url = bucket.getPublicUrl(`${folder}/${fileName}`).data.publicUrl;
      if (fileType === "application/pdf") {
        content = document.createElement("iframe");
        content.className = "paycheck-pdf";
        content.src = url;
        content.title = `${post.title} PDF`;
      } else {
        content = document.createElement("img");
        content.className = "paycheck-image";
        content.src = url;
        content.alt = post.title;
      }
      const download = document.createElement("a");
      download.className = "paycheck-pdf-link";
      download.href = `${url}?download=1`;
      download.textContent = fileType === "application/pdf" ? "Open or download PDF" : "Open or download image";
      download.target = "_blank";
      download.rel = "noopener";
      article.append(postTitle, content, download);
    } else {
      const wrap = document.createElement("div");
      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const tbody = document.createElement("tbody");
      wrap.className = "paycheck-table-wrap";
      wrap.tabIndex = 0;
      wrap.setAttribute("role", "region");
      wrap.setAttribute("aria-label", `${post.title} table`);
      table.className = "paycheck-table";
      parseCells(post.data).forEach((cells, rowIndex) => {
        const row = document.createElement("tr");
        for (const value of cells) {
          const cell = document.createElement(rowIndex === 0 ? "th" : "td");
          if (rowIndex === 0) cell.setAttribute("scope", "col");
          cell.textContent = value;
          row.append(cell);
        }
        (rowIndex === 0 ? thead : tbody).append(row);
      });
      table.append(thead, tbody);
      wrap.append(table);
      article.append(postTitle, wrap);
    }
    edit.type = "button";
    edit.className = "paycheck-edit";
    edit.textContent = "Edit update";
    edit.hidden = !signedIn;
    edit.addEventListener("click", () => {
      if (!signedIn || saving) return;
      editingName = name;
      editingFileName = fileName || null;
      editingFileType = fileType || null;
      title.value = post.title;
      if (fileName) {
        file.required = false;
        heading.textContent = "Edit update";
        submit.textContent = "Save update";
      } else {
        file.required = true;
        heading.textContent = "Replace with a PDF or snip";
        submit.textContent = "Publish update";
      }
      cancel.hidden = false;
      editorStatus.textContent = "";
      title.focus();
    });
    remove.type = "button";
    remove.className = "paycheck-delete";
    remove.textContent = "Delete update";
    remove.hidden = !signedIn;
    remove.addEventListener("click", async () => {
      if (!signedIn || saving) return;
      if (!window.confirm(`Delete "${post.title}" and its uploaded file? This cannot be undone.`)) return;
      saving = true;
      remove.disabled = true;
      editorStatus.textContent = "Deleting update...";
      try {
        const paths = [`${folder}/${name}`];
        if (fileName) paths.push(`${folder}/${fileName}`);
        const { error } = await bucket.remove(paths);
        if (error) throw error;
        if (editingName === name) resetEditor();
        const refreshed = await loadPosts();
        editorStatus.textContent = refreshed
          ? "Update deleted successfully."
          : "Update deleted, but the list could not fully refresh. Reload the page to confirm.";
      } catch (error) {
        editorStatus.textContent = `Could not delete update: ${errorMessage(error)}`;
      } finally {
        saving = false;
        remove.disabled = false;
      }
    });
    article.append(edit, remove);
    item.append(article);
    return item;
  };

  const loadPosts = async () => {
    const revision = ++loadRevision;
    status.textContent = "Loading updates...";
    try {
      const files = [];
      const pageSize = 100;
      for (let offset = 0; ; offset += pageSize) {
        const { data: page, error } = await bucket.list(folder, {
          limit: pageSize,
          offset,
          sortBy: { column: "created_at", order: "desc" },
        });
        if (error) throw error;
        if (!Array.isArray(page)) throw new Error("The table list was empty or invalid.");
        files.push(...page.filter((file) => file.id && file.name.endsWith(".json")));
        if (page.length < pageSize) break;
      }
      const posts = [];
      let failed = 0;
      for (const file of files) {
        try {
          const post = JSON.parse(await readPost(file.name));
          if (typeof post?.title !== "string" || !post.title.trim()) {
            throw new Error("Invalid update data.");
          }
          if (post.type === "pdf") {
            if (typeof post.pdfName !== "string" || !post.pdfName.trim()) {
              throw new Error("Invalid PDF data.");
            }
          } else if (post.type === "file") {
            if (typeof post.fileName !== "string" || !post.fileName.trim() ||
                !Object.values(allowedTypes).includes(post.fileType)) {
              throw new Error("Invalid file data.");
            }
          } else if (typeof post.data !== "string" || !post.data.trim()) {
            throw new Error("Invalid update data.");
          }
          posts.push(renderPost(post, file.name));
        } catch {
          failed++;
        }
      }
      if (revision !== loadRevision) return false;
      list.replaceChildren(...posts);
      status.textContent = failed
        ? `${failed} update${failed === 1 ? "" : "s"} could not be loaded. Refresh to retry.`
        : posts.length ? "" : "No updates have been published yet.";
      return failed === 0;
    } catch (error) {
      if (revision === loadRevision) status.textContent = `Could not load updates: ${errorMessage(error)}`;
      return false;
    }
  };

  const initialize = () => {
    if (!window.supabase?.createClient) {
      status.textContent = "Could not load the Supabase client. Check your connection and refresh.";
      return;
    }
    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    bucket = client.storage.from("coach-thoughts");
    loadPosts();
    client.auth.onAuthStateChange((_event, session) => setSession(session));
    client.auth.getSession().then(({ data: sessionData, error }) => {
      if (error) throw error;
      setSession(sessionData.session);
    }).catch((error) => {
      editorStatus.textContent = `Could not check sign-in status: ${errorMessage(error)}`;
    });
  };

  login.addEventListener("submit", async (event) => {
    event.preventDefault();
    editorStatus.textContent = "Signing in...";
    try {
      const { error } = await client.auth.signInWithPassword({
        email: email.value.trim(),
        password: password.value,
      });
      if (error) throw error;
      password.value = "";
      editorStatus.textContent = "Signed in.";
    } catch (error) {
      editorStatus.textContent = `Could not sign in: ${errorMessage(error)}`;
    }
  });

  signout.addEventListener("click", async () => {
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      resetEditor();
      editorStatus.textContent = "Signed out.";
    } catch (error) {
      editorStatus.textContent = `Could not sign out: ${errorMessage(error)}`;
    }
  });
  cancel.addEventListener("click", () => {
    resetEditor();
    editorStatus.textContent = "";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!signedIn || !bucket) {
      editorStatus.textContent = "Sign in before publishing an update.";
      return;
    }
    const headline = title.value.trim();
    const selectedFile = file.files?.[0];
    if (!headline) {
      editorStatus.textContent = "Enter a headline before publishing.";
      return;
    }
    if (!selectedFile && !editingFileName) {
      editorStatus.textContent = "Choose a PDF or image snip to publish.";
      return;
    }
    let selectedType;
    if (selectedFile) {
      const extension = selectedFile.name.match(/\.(pdf|png|jpe?g|webp)$/i)?.[1].toLowerCase();
      selectedType = extension ? allowedTypes[extension] : null;
      if (!selectedType || selectedFile.type && selectedFile.type !== selectedType) {
        editorStatus.textContent = "Choose a PDF, PNG, JPEG, or WebP file.";
        return;
      }
      if (!selectedFile.size) {
        editorStatus.textContent = "Choose a non-empty file.";
        return;
      }
      if (selectedFile.size > 20 * 1024 * 1024) {
        editorStatus.textContent = "Choose a file no larger than 20 MB.";
        return;
      }
    }
    saving = true;
    submit.disabled = true;
    cancel.disabled = true;
    signout.disabled = true;
    title.disabled = true;
    file.disabled = true;
    editorStatus.textContent = "Publishing update...";
    const wasEditing = Boolean(editingName);
    let publishedFileName = editingFileName;
    let publishedFileType = editingFileType;
    const metadataName = editingName || `${crypto.randomUUID()}.json`;
    try {
      if (selectedFile) {
        const safeName = selectedFile.name
          .normalize("NFKC")
          .replace(/[^\w.-]+/g, "-")
          .replace(/^-+|-+$/g, "");
        publishedFileName = `${crypto.randomUUID()}-${safeName || `spreadsheet.${selectedType.split("/")[1]}`}`;
        publishedFileType = selectedType;
        const { error } = await bucket.upload(`${folder}/${publishedFileName}`, selectedFile, {
          cacheControl: "3600",
          contentType: selectedType,
          upsert: false,
        });
        if (error) throw error;
      }
      const post = { type: "file", title: headline, fileName: publishedFileName, fileType: publishedFileType };
      const body = new Blob([JSON.stringify(post)], {
        type: "application/json;charset=utf-8",
      });
      const { error } = await bucket.upload(`${folder}/${metadataName}`, body, {
        cacheControl: "0",
        contentType: "application/json;charset=utf-8",
        upsert: wasEditing,
      });
      if (error) throw error;
      editingName = metadataName;
      editingFileName = publishedFileName;
      editingFileType = publishedFileType;
      try {
        if (await readPost(metadataName) !== await body.text()) {
          throw new Error("The published copy does not match your changes yet.");
        }
      } catch (error) {
        editorStatus.textContent = `File uploaded, but could not be verified. Your draft is still here: ${errorMessage(error)}`;
        file.value = "";
        file.files = [];
        return;
      }
      resetEditor();
      const refreshed = await loadPosts();
      editorStatus.textContent = refreshed
        ? wasEditing ? "Update saved successfully." : "Update published successfully."
        : "Update saved, but the list could not fully refresh. Reload the page to see it.";
    } catch (error) {
      editorStatus.textContent = `Could not save update: ${errorMessage(error)}`;
    } finally {
      saving = false;
      submit.disabled = false;
      cancel.disabled = false;
      signout.disabled = false;
      title.disabled = false;
      file.disabled = false;
    }
  });

  if (!config?.supabaseUrl || !config?.supabaseAnonKey ||
      config.supabaseUrl.startsWith("YOUR_") || config.supabaseAnonKey.startsWith("YOUR_")) {
    status.textContent = "Connect Supabase to load updates. See the setup instructions.";
  } else if (window.supabase?.createClient) {
    initialize();
  } else {
    const sdk = document.createElement("script");
    sdk.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    sdk.async = true;
    sdk.onload = initialize;
    sdk.onerror = () => { status.textContent = "Could not load the Supabase client. Check your connection and refresh."; };
    document.head.append(sdk);
  }
})();
