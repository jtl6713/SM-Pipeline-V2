(() => {
  const footer = document.querySelector(".studio-footer");
  const bottomScroll = document.getElementById("studioBottomScroll");
  const bottomScrollInner = document.getElementById("studioBottomScrollInner");
  const main = document.getElementById("main");

  if (!footer || !bottomScroll || !bottomScrollInner || !main) return;

  const CANDIDATE_SELECTOR = [
    ".table-wrap",
    ".pipeline-schedule-grid-wrap",
    ".platform-calendar-grid-wrap",
    ".insights-table-wrap"
  ].join(",");

  let activeTarget = null;
  let activeTargetScrollHandler = null;
  let refreshFrame = 0;
  let syncing = false;

  function setRootMetric(name, value) {
    document.documentElement.style.setProperty(name, value);
  }

  function measureFooter() {
    const height = Math.ceil(footer.getBoundingClientRect().height);
    setRootMetric("--studio-footer-height", `${Math.max(height, 1)}px`);
    return height;
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function overflowAmount(element) {
    return Math.max(0, element.scrollWidth - element.clientWidth);
  }

  function chooseTarget(footerHeight) {
    const page = main.querySelector(".page.active");
    if (!page) return null;

    const viewportTop = 72;
    const viewportBottom = Math.max(viewportTop, window.innerHeight - footerHeight - 18);
    const candidates = [...page.querySelectorAll(CANDIDATE_SELECTOR)]
      .filter(isVisible)
      .filter((element) => overflowAmount(element) > 2)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const intersection = Math.max(
          0,
          Math.min(rect.bottom, viewportBottom) - Math.max(rect.top, viewportTop)
        );
        const distance = intersection > 0
          ? 0
          : Math.min(
              Math.abs(rect.bottom - viewportTop),
              Math.abs(rect.top - viewportBottom)
            );
        return {
          element,
          intersection,
          distance,
          overflow: overflowAmount(element)
        };
      });

    candidates.sort((a, b) =>
      (b.intersection - a.intersection) ||
      (a.distance - b.distance) ||
      (b.overflow - a.overflow)
    );

    return candidates[0]?.element || null;
  }

  function detachTarget() {
    if (activeTarget && activeTargetScrollHandler) {
      activeTarget.removeEventListener("scroll", activeTargetScrollHandler);
    }
    activeTarget = null;
    activeTargetScrollHandler = null;
  }

  function syncFromTarget() {
    if (!activeTarget || syncing || bottomScroll.hidden) return;
    const targetMax = Math.max(0, activeTarget.scrollWidth - activeTarget.clientWidth);
    const barMax = Math.max(0, bottomScroll.scrollWidth - bottomScroll.clientWidth);
    if (!targetMax || !barMax) return;

    syncing = true;
    bottomScroll.scrollLeft = (activeTarget.scrollLeft / targetMax) * barMax;
    syncing = false;
  }

  function attachTarget(target) {
    if (activeTarget === target) return;
    detachTarget();
    activeTarget = target;

    if (!activeTarget) return;
    activeTargetScrollHandler = () => syncFromTarget();
    activeTarget.addEventListener("scroll", activeTargetScrollHandler, { passive: true });
  }

  function refresh() {
    refreshFrame = 0;
    const footerHeight = measureFooter();
    const target = chooseTarget(footerHeight);
    attachTarget(target);

    if (!target) {
      bottomScroll.hidden = true;
      bottomScrollInner.style.width = "1px";
      setRootMetric("--studio-bottom-scroll-height", "0px");
      return;
    }

    bottomScroll.hidden = false;
    const barHeight = Math.ceil(bottomScroll.getBoundingClientRect().height);
    setRootMetric("--studio-bottom-scroll-height", `${barHeight}px`);

    // Match the bottom bar's scroll range to the selected content's scroll range,
    // even though the bar and content have different visible widths.
    const targetRange = Math.max(1, target.scrollWidth - target.clientWidth);
    const innerWidth = bottomScroll.clientWidth + targetRange;
    bottomScrollInner.style.width = `${Math.ceil(innerWidth)}px`;
    syncFromTarget();
  }

  function scheduleRefresh() {
    if (refreshFrame) return;
    refreshFrame = requestAnimationFrame(refresh);
  }

  bottomScroll.addEventListener("scroll", () => {
    if (!activeTarget || syncing || bottomScroll.hidden) return;
    const barMax = Math.max(0, bottomScroll.scrollWidth - bottomScroll.clientWidth);
    const targetMax = Math.max(0, activeTarget.scrollWidth - activeTarget.clientWidth);
    if (!barMax || !targetMax) return;

    syncing = true;
    activeTarget.scrollLeft = (bottomScroll.scrollLeft / barMax) * targetMax;
    syncing = false;
  }, { passive: true });

  window.addEventListener("resize", scheduleRefresh, { passive: true });
  window.addEventListener("scroll", scheduleRefresh, { passive: true });
  main.addEventListener("click", () => requestAnimationFrame(scheduleRefresh));

  const resizeObserver = new ResizeObserver(scheduleRefresh);
  resizeObserver.observe(footer);
  resizeObserver.observe(main);

  const mutationObserver = new MutationObserver(scheduleRefresh);
  mutationObserver.observe(main, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden", "style"]
  });

  refresh();
})();
