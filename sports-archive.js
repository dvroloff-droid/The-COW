(() => {
  const archive = document.querySelector("#archive-stories");
  if (!archive) return;

  const bucketName = "coach-thoughts";
  const config = window.COACH_THOUGHTS_CONFIG;
  const sport = archive.dataset.sport;
  const status = document.querySelector("#archive-status");
  const articleList = document.querySelector("#archive-list");
  const { sports, parseStoryArticle, appendSafeStoryNodes } =
    window.COACH_THOUGHTS_STORIES;

  const setStatus = (message) => {
    status.textContent = message;
  };

  const showError = (action, error) => {
    const details =
      error && typeof error.message === "string"
        ? error.message
        : "An unexpected error occurred.";
    setStatus(`${action}: ${details}`);
  };

  const renderArticle = (article, supabaseUrl) => {
    const item = document.createElement("li");
    const story = document.createElement("article");
    const header = document.createElement("header");
    const eyebrow = document.createElement("p");
    const title = document.createElement("h3");
    const body = document.createElement("div");
    story.className = "shared-story-article";
    header.className = "shared-story-header";
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "THE COACH'S NOTEBOOK";
    title.textContent = article.title;
    body.className = "shared-story-body";
    header.append(eyebrow, title);
    story.append(header, body);
    const parsed = new DOMParser().parseFromString(article.html, "text/html");
    appendSafeStoryNodes(parsed.body, body, supabaseUrl, bucketName);
    item.append(story);
    return item;
  };

  const loadArchive = async () => {
    if (!sports.includes(sport)) {
      setStatus("This archive has an invalid sport category.");
      return;
    }
    if (
      !config?.supabaseUrl ||
      !config?.supabaseAnonKey ||
      config.supabaseUrl.startsWith("YOUR_") ||
      config.supabaseAnonKey.startsWith("YOUR_")
    ) {
      setStatus("Connect Supabase to load archived stories. See the setup instructions.");
      return;
    }
    if (!window.supabase?.createClient) {
      setStatus("The Supabase client could not be loaded. Check your connection and refresh.");
      return;
    }

    const bucket = window.supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey,
    ).storage.from(bucketName);

    try {
      const files = [];
      const pageSize = 100;
      let offset = 0;
      while (true) {
        const { data, error } = await bucket.list("", {
          limit: pageSize,
          offset,
          sortBy: { column: "created_at", order: "desc" },
        });
        if (error) throw error;
        const page = data || [];
        files.push(...page.filter((file) =>
          file.id && /^story-.*\.(json|txt)$/i.test(file.name)
        ));
        if (page.length < pageSize) break;
        offset += page.length;
      }

      const stories = [];
      const failedStories = [];
      for (const file of files) {
        try {
          const url = new URL(bucket.getPublicUrl(file.name).data.publicUrl);
          url.searchParams.set("version", String(file.updated_at || file.created_at || ""));
          const response = await fetch(url.href, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`The shared story could not be read (HTTP ${response.status}).`);
          }
          const story = parseStoryArticle(await response.text(), file.name);
          if (story?.sport === sport) {
            stories.push({
              ...story,
              date: Date.parse(file.updated_at || file.created_at || ""),
            });
          }
        } catch (error) {
          failedStories.push(
            error && typeof error.message === "string"
              ? error.message
              : "An unexpected error occurred.",
          );
        }
      }

      stories.sort((left, right) => (right.date || 0) - (left.date || 0));
      articleList.replaceChildren(
        ...stories.map((story) => renderArticle(story, config.supabaseUrl)),
      );
      if (stories.length) {
        setStatus(`${stories.length} archived article${stories.length === 1 ? "" : "s"}.`);
      } else if (failedStories.length) {
        setStatus(`Could not load ${failedStories.length} shared stor${failedStories.length === 1 ? "y" : "ies"}: ${failedStories[0]}`);
      } else {
        setStatus(`No ${sport} stories have been archived yet. Choose ${sport} in the article editor to add one.`);
      }
      if (failedStories.length && stories.length) {
        setStatus(`${stories.length} archived article${stories.length === 1 ? "" : "s"}; ${failedStories.length} shared stor${failedStories.length === 1 ? "y" : "ies"} could not be loaded: ${failedStories[0]}`);
      }
    } catch (error) {
      showError("Could not load the sports archive", error);
    }
  };

  if (window.supabase?.createClient) {
    loadArchive();
    return;
  }

  const sdk = document.createElement("script");
  sdk.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  sdk.async = true;
  sdk.onload = loadArchive;
  sdk.onerror = () => setStatus("Could not load the Supabase client. Check your connection and refresh.");
  document.head.append(sdk);
})();
