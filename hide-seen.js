(() => {
	const seenPrefix = "seen:";
	const stories = [];
	const linkStories = new Map();
	const mobileViewport = matchMedia("(max-width: 767px)");
	let stored = {};
	let paused = false;
	let bottomTimer;
	let scrollFrame;
	let status;
	let pauseToggle;
	let count;

	function reportError(error) {
		console.error("Hacker News Hide Seen:", error);
		if (status) status.textContent = "Unable to save or load seen history.";
	}

	function render() {
		for (const story of stories) {
			const seen = stored[`${seenPrefix}${story.hash}`] === true;
			for (const row of story.rows) {
				row.style.transition = matchMedia("(prefers-reduced-motion: reduce)").matches
					? "none" : "opacity 220ms ease-out";
				row.style.opacity = seen ? "0.35" : "";
			}
		}
		pauseToggle.checked = paused;
		const total = Object.keys(stored).filter((key) => key.startsWith(seenPrefix)).length;
		count.textContent = `${total} seen`;
		updateBottomTimer();
	}

	async function markSeen(story) {
		if (paused || story.marking || (story.hash && stored[`${seenPrefix}${story.hash}`])) return;
		story.marking = true;
		try {
			await browser.runtime.sendMessage({ type: "markSeen", url: story.url });
		} finally {
			story.marking = false;
		}
	}

	async function markPageSeen() {
		if (paused) return;
		await browser.runtime.sendMessage({
			type: "markSeenMany",
			urls: stories.map((story) => story.url)
		});
	}

	function atMobileBottom() {
		return mobileViewport.matches && !paused && document.visibilityState === "visible"
			&& scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
	}

	function updateBottomTimer() {
		const unseen = stories.some((story) => !stored[`${seenPrefix}${story.hash}`]);
		if (!atMobileBottom() || !unseen) {
			clearTimeout(bottomTimer);
			bottomTimer = undefined;
			return;
		}
		if (bottomTimer !== undefined) return;
		bottomTimer = setTimeout(async () => {
			bottomTimer = undefined;
			if (!atMobileBottom()) return;
			try {
				for (const story of stories) await markSeen(story);
			} catch (error) {
				reportError(error);
			}
		}, 8000);
	}

	function trackMobileScroll() {
		for (const story of stories) {
			const row = story.rows[0];
			const rect = row.getBoundingClientRect();
			if (mobileViewport.matches && !paused && document.visibilityState === "visible"
				&& row.isConnected && rect.bottom > 0 && rect.top < innerHeight * 0.2) {
				markSeen(story).catch(reportError);
			}
		}
		updateBottomTimer();
	}

	function addControls(main) {
		const controlsRow = document.createElement("tr");
		const cell = document.createElement("td");
		cell.colSpan = 3;
		const controls = document.createElement("div");
		controls.id = "hn-hide-seen-controls";
		controls.style.cssText = "display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:8px 10px;font:12px Verdana,sans-serif;color:#000;";

		const pauseLabel = document.createElement("label");
		pauseLabel.style.cssText = "display:inline-flex;align-items:center;gap:4px;cursor:pointer;";
		pauseToggle = document.createElement("input");
		pauseToggle.type = "checkbox";
		pauseToggle.addEventListener("change", async () => {
			const previous = paused;
			paused = pauseToggle.checked;
			trackMobileScroll();
			render();
			try {
				await browser.storage.local.set({ paused });
			} catch (error) {
				paused = previous;
				trackMobileScroll();
				render();
				reportError(error);
			}
		});
		pauseLabel.append(pauseToggle, "Pause");

		const clear = document.createElement("button");
		clear.type = "button";
		clear.textContent = "Clear seen";
		clear.addEventListener("click", async () => {
			clear.disabled = true;
			try {
				await browser.runtime.sendMessage({ type: "clearSeen" });
				stored = Object.fromEntries(
					Object.entries(stored).filter(([key]) => !key.startsWith(seenPrefix))
				);
				status.textContent = "";
				trackMobileScroll();
				render();
			} catch (error) {
				reportError(error);
			} finally {
				clear.disabled = false;
			}
		});

		const exportButton = document.createElement("button");
		exportButton.type = "button";
		exportButton.textContent = "Export seen.json";
		exportButton.addEventListener("click", async () => {
			try {
				await browser.runtime.sendMessage({ type: "exportSeen" });
				status.textContent = "";
			} catch (error) {
				reportError(error);
			}
		});

		count = document.createElement("span");
		status = document.createElement("span");
		status.setAttribute("role", "status");
		controls.append(pauseLabel, clear, exportButton, count, status);
		cell.append(controls);
		controlsRow.append(cell);
		main.tBodies[0].insertBefore(controlsRow, main.rows[1] || null);
	}

	async function initialize() {
		const main = document.querySelector("#hnmain");
		if (!main || document.querySelector("#hn-hide-seen-controls")) return;
		addControls(main);
		browser.storage.onChanged.addListener((changes, area) => {
			if (area !== "local") return;
			for (const [key, change] of Object.entries(changes)) {
				if (change.newValue === undefined) delete stored[key];
				else stored[key] = change.newValue;
			}
			paused = stored.paused === true;
			if (changes.paused) trackMobileScroll();
			render();
		});
		stored = await browser.storage.local.get(null);
		paused = stored.paused === true;

		const isDiscussion = location.pathname === "/item";
		for (const row of document.querySelectorAll("tr.athing")) {
			const title = row.querySelector(".titleline > a");
			if (!title) continue;
			const url = new URL(title.href);
			if (!["http:", "https:"].includes(url.protocol)) continue;
			url.hash = "";
			const story = { url: url.href };
			linkStories.set(title, story);
			const metadata = row.nextElementSibling;
			if (metadata && metadata.querySelector(".subtext")) {
				for (const link of metadata.querySelectorAll("a[href]")) {
					const target = new URL(link.href);
					if (target.pathname === "/item" && target.searchParams.get("id") === row.id) {
						linkStories.set(link, story);
					}
				}
			}
			if (isDiscussion) {
				await markSeen(story);
				continue;
			}
			const digest = await crypto.subtle.digest(
				"SHA-256", new TextEncoder().encode(story.url)
			);
			story.hash = Array.from(new Uint8Array(digest), (byte) =>
				byte.toString(16).padStart(2, "0")
			).join("");
			story.rows = [row];
			if (metadata && metadata.querySelector(".subtext")) {
				story.rows.push(metadata);
				const spacer = metadata.nextElementSibling;
				if (spacer && spacer.classList.contains("spacer")) story.rows.push(spacer);
			}
			stories.push(story);
		}

		function onOpen(event) {
			if (event.type === "auxclick" && event.button !== 1) return;
			const link = event.target.closest("a");
			const story = linkStories.get(link);
			if (story) markSeen(story).catch(reportError);
		}
		document.addEventListener("click", onOpen, true);
		document.addEventListener("auxclick", onOpen, true);
		let moreNavigationPending = false;
		async function onMore(event) {
			if (event.type === "auxclick" && event.button !== 1) return;
			const link = event.target.closest("a.morelink");
			if (!link || paused) return;
			if (event.type === "auxclick" || event.metaKey || event.ctrlKey
				|| event.shiftKey || event.altKey || event.button !== 0) {
				markPageSeen().catch(reportError);
				return;
			}
			event.preventDefault();
			if (moreNavigationPending) return;
			moreNavigationPending = true;
			try {
				await markPageSeen();
			} catch (error) {
				reportError(error);
			} finally {
				location.assign(link.href);
			}
		}
		document.addEventListener("click", onMore, true);
		document.addEventListener("auxclick", onMore, true);
		let previousMousePosition;
		document.addEventListener("mousemove", async (event) => {
			const unchanged = previousMousePosition
				&& previousMousePosition.x === event.clientX
				&& previousMousePosition.y === event.clientY;
			previousMousePosition = { x: event.clientX, y: event.clientY };
			if (unchanged || paused || mobileViewport.matches) return;
			const title = event.target.closest(".titleline > a");
			const story = linkStories.get(title);
			if (!story || !story.hash) return;
			try {
				await markSeen(story);
			} catch (error) {
				reportError(error);
			}
		}, true);
		window.addEventListener("scroll", () => {
			if (!atMobileBottom()) {
				clearTimeout(bottomTimer);
				bottomTimer = undefined;
			}
			if (scrollFrame !== undefined) return;
			scrollFrame = requestAnimationFrame(() => {
				scrollFrame = undefined;
				trackMobileScroll();
			});
		}, { passive: true });
		window.addEventListener("resize", trackMobileScroll);
		mobileViewport.addEventListener("change", trackMobileScroll);
		document.addEventListener("visibilitychange", trackMobileScroll);
		trackMobileScroll();
		render();
	}

	initialize().catch(reportError);
})();
