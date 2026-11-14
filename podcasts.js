window.createPodcasts = () => {
  const list = document.querySelector("#podcast-list");
  const status = document.querySelector("#podcast-status");
  const signIn = document.querySelector("#podcast-sign-in");
  const form = document.querySelector("#podcast-form");
  const titleInput = document.querySelector("#podcast-title");
  const urlInput = document.querySelector("#podcast-url");
  const submitButton = form.querySelector('button[type="submit"]');
  let bucket;
  let signedIn = false;
  let saving = false;
  let loadRevision = 0;

  const validUrl = (value) => {
    try {
      const url = new URL(value);
      return (url.protocol === "https:" || url.protocol === "http:") &&
        !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  };

  const load = async () => {
    const revision = ++loadRevision;
    status.textContent = "Loading podcasts...";
    try {
      const files = [];
      const pageSize = 100;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await bucket.list("podcasts", {
          limit: pageSize,
          offset,
          sortBy: { column: "created_at", order: "desc" },
        });
        if (error) throw error;
        const page = data || [];
        files.push(...page.filter((file) => file.id && file.name.endsWith(".json")));
        if (page.length < pageSize) break;
      }

      const entries = [];
      let failed = 0;
      for (const file of files) {
        try {
          const url = new URL(bucket.getPublicUrl(`podcasts/${file.name}`).data.publicUrl);
          url.searchParams.set("version", String(file.updated_at || file.created_at || ""));
          const response = await fetch(url.href, { cache: "no-store" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const entry = await response.json();
          const href = typeof entry?.url === "string" ? validUrl(entry.url) : null;
          if (typeof entry?.title !== "string" || !entry.title.trim() || !href) {
            throw new Error("Invalid podcast link");
          }
          const item = document.createElement("li");
          const link = document.createElement("a");
          link.href = href;
          link.textContent = entry.title.trim();
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          item.append(link);
          entries.push(item);
        } catch {
          failed++;
        }
      }
      if (revision !== loadRevision) return false;
      list.replaceChildren(...entries);
      status.textContent = failed
        ? `${failed} podcast link${failed === 1 ? "" : "s"} could not be loaded. Refresh to retry.`
        : entries.length ? "" : "No podcasts have been added yet.";
      return failed === 0;
    } catch (error) {
      if (revision === loadRevision) {
        status.textContent = `Could not load podcasts: ${error.message || "An unexpected error occurred."}`;
      }
      return false;
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!signedIn || !bucket) {
      status.textContent = "Sign in before adding a podcast.";
      return;
    }
    const title = titleInput.value.trim();
    const url = validUrl(urlInput.value.trim());
    if (!title) {
      status.textContent = "Enter a podcast name.";
      titleInput.focus();
      return;
    }
    if (!url) {
      status.textContent = "Enter a valid HTTP or HTTPS podcast link without credentials.";
      urlInput.focus();
      return;
    }
    saving = true;
    submitButton.disabled = true;
    status.textContent = "Adding podcast...";
    try {
      const body = new Blob([JSON.stringify({ title, url })], { type: "application/json" });
      const { error } = await bucket.upload(`podcasts/${crypto.randomUUID()}.json`, body, {
        contentType: "application/json",
        cacheControl: "0",
        upsert: false,
      });
      if (error) throw error;
      form.reset();
      const refreshed = await load();
      if (!refreshed) {
        status.textContent = "Podcast added, but the list couldn't fully refresh. Reload the page to see it.";
      }
    } catch (error) {
      status.textContent = `Could not add podcast: ${error.message || "An unexpected error occurred."}`;
    } finally {
      saving = false;
      submitButton.disabled = false;
    }
  });

  return {
    start(storageBucket) {
      bucket = storageBucket;
      load();
    },
    setSignedIn(value) {
      signedIn = value;
      form.hidden = !value;
      signIn.hidden = value;
    },
    unavailable(message) {
      signIn.hidden = true;
      status.textContent = message;
    },
  };
};
