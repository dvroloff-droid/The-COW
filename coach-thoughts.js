(() => {
  const bucketName = "coach-thoughts";
  const maxFileSize = 20 * 1024 * 1024;
  const config = window.COACH_THOUGHTS_CONFIG;
  const status = document.querySelector("#thoughts-status");
  const loginForm = document.querySelector("#thoughts-login");
  const resetRequestButton = document.querySelector("#thoughts-reset-request");
  const resetForm = document.querySelector("#thoughts-reset");
  const uploadArea = document.querySelector("#thoughts-uploader");
  const uploadForm = document.querySelector("#thoughts-upload");
  const fileInput = document.querySelector("#thoughts-file");
  const storyForm = document.querySelector("#thoughts-story");
  const storyInput = document.querySelector("#thoughts-story-text");
  const signOutButton = document.querySelector("#thoughts-signout");
  const fileList = document.querySelector("#thoughts-list");

  let statusRevision = 0;
  const setStatus = (message) => {
    statusRevision++;
    status.textContent = message;
  };

  const showSetupInstructions = () => {
    setStatus("Connect a Supabase project to enable file uploads. See the setup instructions.");
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
      return;
    }

    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    let recoveryMode = hashParams.get("type") === "recovery";
    const recoveryError = hashParams.get("error_description");
    const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const bucket = client.storage.from(bucketName);

    const showError = (action, error) => {
      const details =
        error && typeof error.message === "string"
          ? error.message
          : "An unexpected error occurred.";
      setStatus(`${action}: ${details}`);
    };

    const showSession = (session) => {
      loginForm.hidden = Boolean(session);
      resetForm.hidden = !session || !recoveryMode;
      uploadArea.hidden = !session || recoveryMode;
    };

    const loadFiles = async (preserveStatus = false, openStoryName = null) => {
      const startingRevision = statusRevision;
      fileList.replaceChildren();
      try {
        const { data, error } = await bucket.list("", {
          limit: 100,
          sortBy: { column: "created_at", order: "desc" },
        });

        if (error) {
          showError("Could not load shared files", error);
          return;
        }

        const files = (data || []).filter((file) => file.id);
        if (files.length === 0) {
          if (!preserveStatus && statusRevision === startingRevision) {
            setStatus("No files or stories have been shared yet.");
          }
          const item = document.createElement("li");
          item.textContent = "Your shared files and stories will appear here.";
          fileList.append(item);
          return;
        }

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
            let loaded = false;
            let loading = false;
            storyArticle.className = "shared-story-article";
            storyEyebrow.className = "eyebrow";
            storyEyebrow.textContent = "COACH'S NOTEBOOK";
            storyHeader.className = "shared-story-header";
            storyBody.className = "shared-story-body";
            summary.textContent = file.name
              .replace(/^story-[0-9a-f-]{36}-/i, "")
              .replace(/\.txt$/i, "")
              .replace(/-/g, " ") || "Read shared story";
            storyHeader.append(storyEyebrow, storyTitle);
            storyArticle.append(storyHeader, storyBody);
            details.append(summary, storyArticle);
            details.addEventListener("toggle", async () => {
              if (!details.open || loaded || loading) return;
              loading = true;
              storyBody.textContent = "Loading story...";
              try {
                const { data, error } = await bucket.download(file.name);
                if (error) {
                  showError("Could not load shared story", error);
                  storyBody.textContent = "Could not load this story. Open it again to retry.";
                  return;
                }
                if (!data || typeof data.text !== "function") {
                  throw new Error("The shared story could not be read.");
                }
                const lines = (await data.text()).split(/\r?\n/);
                const titleIndex = lines.findIndex((line) => line.trim());
                storyTitle.textContent = titleIndex < 0
                  ? "Untitled story"
                  : lines[titleIndex].trim();
                const paragraphs = titleIndex < 0
                  ? []
                  : lines.slice(titleIndex + 1).join("\n").trim().split(/\n\s*\n/).filter(Boolean);
                storyBody.replaceChildren();
                for (const paragraph of paragraphs) {
                  const paragraphElement = document.createElement("p");
                  paragraphElement.textContent = paragraph.trim();
                  storyBody.append(paragraphElement);
                }
                loaded = true;
              } catch (error) {
                showError("Could not load shared story", error);
                storyBody.textContent = "Could not load this story. Open it again to retry.";
              } finally {
                loading = false;
              }
            });
            details.open = file.name === openStoryName;
            item.append(details);
          } else {
            const link = document.createElement("a");
            link.href = bucket.getPublicUrl(file.name, { download: true }).data.publicUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = file.name.replace(/^[0-9a-f-]{36}-/i, "");
            item.append(link);
          }
          fileList.append(item);
        }

        if (!preserveStatus && statusRevision === startingRevision) {
          setStatus(`${files.length} shared item${files.length === 1 ? "" : "s"}.`);
        }
      } catch (error) {
        showError("Could not load shared files", error);
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

    storyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const story = storyInput.value;
      if (!story.trim()) {
        setStatus("Write or paste a story before publishing.");
        return;
      }

      const storyFile = new Blob([story], { type: "text/plain;charset=utf-8" });
      if (storyFile.size > maxFileSize) {
        setStatus("Choose a story no larger than 20 MB.");
        return;
      }

      const publishButton = storyForm.querySelector('button[type="submit"]');
      publishButton.disabled = true;
      setStatus("Publishing story...");

      try {
        const storyTitle = story
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find(Boolean)
          ?.slice(0, 80);
        const safeTitle = storyTitle
          ?.normalize("NFKC")
          .replace(/[^\w.-]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const objectName = `story-${crypto.randomUUID()}-${safeTitle || "untitled"}.txt`;
        const { error } = await bucket.upload(objectName, storyFile, {
          cacheControl: "3600",
          contentType: "text/plain;charset=utf-8",
          upsert: false,
        });

        if (error) {
          showError("Could not publish story", error);
          return;
        }

        storyForm.reset();
        setStatus("Story published successfully.");
        await loadFiles(true, objectName);
      } catch (error) {
        showError("Could not publish story", error);
      } finally {
        publishButton.disabled = false;
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

    uploadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = fileInput.files?.[0];
      if (!file) {
        setStatus("Choose a file before uploading.");
        return;
      }
      if (file.size > maxFileSize) {
        setStatus("Choose a file no larger than 20 MB.");
        return;
      }

      const uploadButton = uploadForm.querySelector('button[type="submit"]');
      uploadButton.disabled = true;
      setStatus("Preparing file...");

      try {
        const safeName = file.name
          .normalize("NFKC")
          .replace(/[^\w.-]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const objectName = `${crypto.randomUUID()}-${safeName || "upload"}`;
        setStatus("Uploading file...");
        const { error } = await bucket.upload(objectName, file, {
          cacheControl: "3600",
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

        if (error) {
          showError("Could not upload file", error);
          return;
        }

        uploadForm.reset();
        setStatus("File uploaded successfully.");
        await loadFiles();
      } catch (error) {
        showError("Could not upload file", error);
      } finally {
        uploadButton.disabled = false;
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
