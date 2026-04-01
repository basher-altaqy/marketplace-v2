(async () => {
  try {
    await import('/js/main.js');
  } catch (error) {
    console.error(error);
    alert('Failed to load marketplace frontend.');
  }
})();
