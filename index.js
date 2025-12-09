async function init() {
  // Когда пользователь нажимает на иконку приложения в тулбаре
  await miro.board.ui.on('icon:click', async () => {
    await miro.board.ui.openPanel({
      url: 'panel.html', // эта страница откроется в панели слева
    });
  });
}

init();
