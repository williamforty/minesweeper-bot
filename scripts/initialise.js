function waitForTest(test) {
  return new Promise((resolve) => {
    const initialTest = test();

    if (initialTest) resolve(initialTest);

    const observer = new MutationObserver((mutations) => {
      const testResult = test();
      if (testResult) {
        resolve(testResult);
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

(async () => {
  const canvas = await waitForTest(() => {
    const el = document.querySelector("canvas");
    return el && el.clientWidth === 600 ? el : false;
  });

  const board = new Board(canvas);

  window.board = board;

  board.solve();
})();
