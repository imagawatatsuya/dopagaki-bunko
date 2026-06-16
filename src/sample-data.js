export const sampleWorks = [
  {
    id: 'work-joseito',
    title: '女生徒',
    author: '太宰治',
    sourceTitleLines: ['女生徒', '太宰治'],
    createdAt: '2026-06-10T09:00:00.000Z'
  },
  {
    id: 'work-ningen-shikkaku',
    title: '人間失格',
    author: '太宰治',
    sourceTitleLines: ['人間失格', '太宰治'],
    createdAt: '2026-06-11T09:00:00.000Z'
  },
  {
    id: 'work-yume-juya',
    title: '夢十夜',
    author: '夏目漱石',
    sourceTitleLines: ['夢十夜', '夏目漱石'],
    createdAt: '2026-06-12T09:00:00.000Z'
  }
];

export const sampleFragments = [
  {
    id: 'fragment-001',
    workId: 'work-joseito',
    index: 1,
    plainText: '私は、朝、眼をさますときの気持が、いちばん嫌い。何かしら、からだじゅうが恥ずかしい。',
    displayHtml: '<ruby>私<rt>わたし</rt></ruby>は、朝、眼をさますときの気持が、いちばん嫌い。<br>何かしら、からだじゅうが恥ずかしい。'
  },
  {
    id: 'fragment-002',
    workId: 'work-ningen-shikkaku',
    index: 1,
    plainText: '恥の多い生涯を送って来ました。',
    displayHtml: '恥の多い生涯を送って来ました。'
  },
  {
    id: 'fragment-003',
    workId: 'work-yume-juya',
    index: 1,
    plainText: 'こんな夢を見た。',
    displayHtml: 'こんな夢を見た。'
  }
];
