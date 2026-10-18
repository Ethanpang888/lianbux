/* src/components/tabbar.js —— 底部主入口（修炼命名：洞府=首页，修炼记录=记录；保留第五栏） */
const Tabbar = {
  items: [
    { key: 'home', ic: '🏠', name: '洞府' },
    { key: 'today', ic: '🏋', name: '训练' },
    { key: 'diet', ic: '🍚', name: '饮食' },
    { key: 'records', ic: '📈', name: '修炼记录' },
    { key: 'me', ic: '👤', name: '我的' }
  ],
  icon(key) {
    const paths = {
      home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
      today: '<path d="m6 6 12 12M3 7l4-4M17 21l4-4M3 11l8-8M13 21l8-8"/>',
      diet: '<path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-5 3-5 10 0 10"/>',
      records: '<path d="M4 3v18h17M8 15l4-5 4 3 5-7"/>',
      me: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
      mentor: '<path d="M21 11a9 9 0 0 1-9 9H4l-1 1v-9a9 9 0 0 1 18-1Z"/><path d="M8 10h8M8 14h5"/>',
      book: '<path d="M12 5v16M3 3h3a9 9 0 0 1 6 2 9 9 0 0 1 6-2h3v16h-3a9 9 0 0 0-6 2 9 9 0 0 0-6-2H3Z"/>'
    }
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[key] || paths.home) + '</svg>'
  },
  render() {
    document.getElementById('tabbar').innerHTML = this.items.map(it =>
      '<button data-k="' + it.key + '"><span class="ic">' + this.icon(it.key) + '</span>' + it.name + '</button>').join('')
    document.querySelectorAll('#tabbar button').forEach(b => {
      b.onclick = () => Router.go(b.dataset.k)
    })
  },
  mark(path) {
    document.querySelectorAll('#tabbar button').forEach(b => {
      b.classList.toggle('on', b.dataset.k === path)
      if (b.dataset.k === path) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current')
    })
  }
}
