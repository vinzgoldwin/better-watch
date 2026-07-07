const QUALITY_TOKENS = new Set([
  '720p',
  '1080p',
  '2160p',
  '4k',
  'h264',
  'h265',
  'x264',
  'x265'
]);

const TOKEN_CORRECTIONS = new Map([
  ['Aj', 'AJ'],
  ['Mclane', 'McLane'],
  ['Mack', 'Mack'],
  ['Mcqueen', 'McQueen'],
  ['Mac', 'Mac']
]);

const ARTIST_OVERRIDES = {
  'homewreck/missa_anhonestman_51941220530m1080.mp4': ['Blake Blossom', 'Will Pounder'],
  'homewreck/missa_abeautifulmistake_51941200211m1080.mp4': ['Kenzie Reeves', 'Tyler Nixon']
};

const SHORT_NAME_RULES = [
  {
    artist: 'Blair Williams',
    token: 'blair',
    folders: ['homewreck', 'seduction', 'taboo'],
    pathIncludes: ['missa_']
  },
  {
    artist: 'Alexia Anders',
    token: 'alexia',
    folders: ['taboo'],
    pathIncludes: ['missa_']
  },
  {
    artist: 'Isiah Maxwell',
    token: 'isiah',
    folders: ['seduction', 'taboo'],
    pathIncludes: ['missa_']
  },
  {
    artist: 'Jane Wilde',
    token: 'jane',
    folders: ['taboo'],
    pathIncludes: ['missa_']
  },
  {
    artist: 'Jennifer White',
    token: 'jennifer',
    folders: ['taboo'],
    pathIncludes: ['missa_']
  },
  {
    artist: 'Jessa Rhodes',
    token: 'jessa',
    folders: ['seduction'],
    pathIncludes: ['missa_']
  },
  {
    artist: 'Katrina Colt',
    token: 'katrina',
    folders: ['homewreck', 'seduction'],
    pathIncludes: ['missa_']
  },
  {
    artist: 'Laney Grey',
    token: 'laney',
    folders: ['homewreck', 'taboo'],
    pathIncludes: ['missa_']
  },
  {
    artist: 'Melody Marks',
    token: 'melody',
    folders: ['taboo'],
    pathIncludes: ['missa_']
  },
  {
    artist: 'Scarlett Mae',
    token: 'scarlett',
    folders: ['seduction'],
    pathIncludes: ['missa_']
  }
];

const FILENAME_ALIAS_RULES = [
  { artist: 'Aaliyah Yasin', aliases: ['aaliyahyasin'], folders: ['xxxsmall/Hijab/fp'] },
  { artist: 'Alix Lynx', aliases: ['alixlynx'], folders: ['t7/primal'] },
  { artist: 'Aria Alexander', aliases: ['ariaalexander'], folders: ['t7/primal'] },
  { artist: 'Alexis Zara', aliases: ['alexiszara'], folders: ['megasite'] },
  { artist: 'Anikka Albrite', aliases: ['anikkaalbrite', 'annikaalbrite'], folders: ['megasite'] },
  { artist: 'Anna Chambers', aliases: ['annachambers'], folders: ['megasite'] },
  { artist: 'Ashley Lane', aliases: ['ashleylane'], folders: ['t7/primal'] },
  { artist: 'Ashley Pink', aliases: ['ashleypink'], folders: ['megasite'] },
  { artist: 'Aubrey Gold', aliases: ['aubreygold'], folders: ['megasite'] },
  { artist: 'Cecilia Taylor', aliases: ['ceciliataylor'], folders: ['megasite'] },
  { artist: 'Channy Crossfire', aliases: ['channycrossfire'], folders: ['megasite'] },
  { artist: 'Courtney Taylor', aliases: ['courtneytaylor'], folders: ['megasite'] },
  { artist: 'Cristi Ann', aliases: ['cristiann'], folders: ['megasite'] },
  { artist: 'Demi Hawks', aliases: ['demihawks'], folders: ['xxxsmall/fp'] },
  { artist: 'Ember Snow', aliases: ['embersnow', 'emberisadomme'], folders: ['megasite'] },
  { artist: 'Emma Hix', aliases: ['emmahix'], folders: ['megasite'] },
  { artist: 'Gabi Paltrova', aliases: ['gabipaltrova'], folders: ['megasite'] },
  { artist: 'Gia Vendetti', aliases: ['giavendetti'], folders: ['megasite'] },
  { artist: 'Goddess Vicki', aliases: ['goddessvicki'], folders: ['megasite'] },
  { artist: 'Goldie Rush', aliases: ['goldierush'], folders: ['megasite'] },
  { artist: 'Halle Hayes', aliases: ['hallehayes'], folders: ['megasite'] },
  { artist: 'Jada Kai', aliases: ['jadakai'], folders: ['megasite'] },
  { artist: 'Jade Kimiko', aliases: ['jadekimiko'], folders: ['megasite'] },
  { artist: 'Jasmine Webb', aliases: ['jasminewebb'], folders: ['megasite'] },
  { artist: 'Jezabel Vessir', aliases: ['jezabelvessir'], folders: ['megasite'] },
  { artist: 'Jillian Janson', aliases: ['jilianjanson'], folders: ['megasite'] },
  { artist: 'Kat Dior', aliases: ['katdior'], folders: ['megasite'] },
  { artist: 'Kathryn Mae', aliases: ['kathrynmae'], folders: ['megasite'] },
  { artist: 'Kay Carter', aliases: ['kaycarter'], folders: ['megasite'] },
  { artist: 'Kayla Green', aliases: ['kaylagreen'], folders: ['megasite'] },
  { artist: 'Kennedy Kressler', aliases: ['kennedykressler'], folders: ['megasite'] },
  { artist: 'Kenzie Madison', aliases: ['kenziemadison'], folders: ['megasite'] },
  { artist: 'Kira Perez', aliases: ['kiraperez'], folders: ['xxxsmall/Hijab/fp'] },
  { artist: 'Kristina Rose', aliases: ['kristinarose'], folders: ['megasite'] },
  { artist: 'Kylie Jay', aliases: ['kyliejay'], folders: ['t7/primal'] },
  { artist: 'Kylie Kingston', aliases: ['kyliekingston'], folders: ['megasite'] },
  { artist: 'Lala Ivey', aliases: ['lalaivey'], folders: ['megasite'] },
  { artist: 'Lana Violet', aliases: ['lanaviolet'], folders: ['megasite'] },
  { artist: 'Lauren Phillips', aliases: ['gkmlaurenphilips'], folders: ['megasite'] },
  { artist: 'Layla Jenner', aliases: ['laylajenner'], folders: ['xxxsmall/fp'] },
  { artist: 'Lienne Dagger', aliases: ['liennedagger'], folders: ['megasite'] },
  { artist: 'Lilian Stone', aliases: ['lilianstone'], folders: ['megasite'] },
  { artist: 'Lily LaBeau', aliases: ['lilylabeau', 'lilylebeau'], folders: ['t7/primal'] },
  { artist: 'Lisa Tiffian', aliases: ['lisatiffian'], folders: ['megasite'] },
  { artist: 'Luna Star', aliases: ['lunastar', 'luna star'], folders: ['megasite'] },
  { artist: 'Madison Wilde', aliases: ['madisonwilde'], folders: ['megasite'] },
  { artist: 'Marsha May', aliases: ['marshamay'], folders: ['megasite'] },
  { artist: 'Mia James', aliases: ['miajames'], folders: ['megasite'] },
  { artist: 'Naomi Swann', aliases: ['naomiswann'], folders: ['t7/primal'] },
  { artist: 'Nikki Delano', aliases: ['nikkidelano'], folders: ['megasite'] },
  { artist: 'Nina Elle', aliases: ['ninaelle'], folders: ['megasite'] },
  { artist: 'Noemie Bilas', aliases: ['noemiebilas', 'noemie bilas'], folders: ['megasite'] },
  { artist: 'Osa Lovely', aliases: ['osalovely'], folders: ['megasite'] },
  { artist: 'Raven Bay', aliases: ['ravenbay'], folders: ['megasite'] },
  { artist: 'Richelle Ryan', aliases: ['richellryan'], folders: ['megasite'] },
  { artist: 'Riley Reid', aliases: ['rileyreid'], folders: ['t7/primal'] },
  { artist: 'Sami Parker', aliases: ['samiparker'], folders: ['megasite'] },
  { artist: 'Sarah Banks', aliases: ['sarahbanks', 'sarah banks'], folders: ['megasite'] },
  { artist: 'Tiffani Time', aliases: ['tiffanitime'], folders: ['megasite'] },
  { artist: 'Vanessa Cage', aliases: ['vanessacage'], folders: ['megasite'] },
  { artist: 'Vanessa Vega', aliases: ['vanessavega'], folders: ['megasite'] },
  { artist: 'Veruca James', aliases: ['verucajames'], folders: ['t7/primal'] },
  { artist: 'Vicki Chase', aliases: ['vickichase'], folders: ['megasite'] },
  { artist: 'Victoria June', aliases: ['victoriajune', 'victoria june'], folders: ['megasite'] },
  { artist: 'Zoe Clark', aliases: ['zoeclark'], folders: ['megasite'] }
];

function titleCaseWord(word) {
  const lower = word.toLowerCase();
  const titled = `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  return TOKEN_CORRECTIONS.get(titled) || titled;
}

function splitCamelName(token) {
  return token
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[^a-zA-Z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(titleCaseWord)
    .join(' ');
}

function isLikelyArtistName(name) {
  const words = name.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 3 && words.every((word) => /^[A-Z][A-Za-z]*$/.test(word));
}

function addArtist(artists, name) {
  const normalized = splitCamelName(name);
  if (isLikelyArtistName(normalized)) artists.add(normalized);
}

function artistsFromT7Path(relativePath) {
  if (!relativePath.startsWith('t7/')) return [];

  const artists = new Set();
  const fileName = relativePath.split('/').at(-1)?.replace(/\.[^.]+$/, '') || '';
  const parts = fileName.split('_');
  const sceneIndex = parts.findIndex((part) => /^s\d+$/i.test(part));
  if (sceneIndex === -1) return [];

  for (const part of parts.slice(sceneIndex + 1)) {
    if (QUALITY_TOKENS.has(part.toLowerCase())) break;
    addArtist(artists, part);
  }

  return [...artists];
}

function searchKey(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function artistAliases(name) {
  const compact = searchKey(name);
  return compact.length >= 6 ? [compact] : [];
}

function matchesRuleContext(movie, rule) {
  const relativePath = movie.relativePath.toLowerCase();
  const folder = movie.folder.toLowerCase();

  if (rule.folders && !rule.folders.some((item) => {
    const normalized = item.toLowerCase();
    return folder === normalized || folder.startsWith(`${normalized}/`);
  })) return false;
  if (rule.pathIncludes && !rule.pathIncludes.every((item) => relativePath.includes(item.toLowerCase()))) return false;

  return true;
}

function artistsFromShortNameRules(movie) {
  const haystack = searchKey(`${movie.relativePath} ${movie.title || ''}`);
  const artists = [];

  for (const rule of SHORT_NAME_RULES) {
    if (!matchesRuleContext(movie, rule)) continue;
    if (haystack.includes(searchKey(rule.token))) artists.push(rule.artist);
  }

  return [...new Set(artists)].sort((a, b) => a.localeCompare(b));
}

function artistsFromFilenameAliasRules(movie) {
  const haystack = searchKey(`${movie.relativePath} ${movie.title || ''}`);
  const artists = [];

  for (const rule of FILENAME_ALIAS_RULES) {
    if (!matchesRuleContext(movie, rule)) continue;
    if (rule.aliases.some((alias) => haystack.includes(searchKey(alias)))) artists.push(rule.artist);
  }

  return [...new Set(artists)].sort((a, b) => a.localeCompare(b));
}

function explicitMovieArtists(movie) {
  const override = ARTIST_OVERRIDES[movie.relativePath];
  if (override) return override;

  const fromPath = artistsFromT7Path(movie.relativePath).sort((a, b) => a.localeCompare(b));
  if (fromPath.length) return fromPath;

  return [...new Set([
    ...artistsFromShortNameRules(movie),
    ...artistsFromFilenameAliasRules(movie)
  ])].sort((a, b) => a.localeCompare(b));
}

function artistsFromKnownNames(movie, knownArtists) {
  const haystack = searchKey(`${movie.relativePath} ${movie.title || ''}`);
  if (!haystack) return [];

  const artists = [];
  for (const artist of knownArtists) {
    if (artist.aliases.some((alias) => haystack.includes(alias))) artists.push(artist.name);
  }

  return artists.sort((a, b) => a.localeCompare(b));
}

export function resolveMovieArtists(movie) {
  return explicitMovieArtists(movie);
}

export function enrichMoviesWithArtists(movies) {
  const explicit = movies.map((movie) => explicitMovieArtists(movie));
  const knownArtists = [...new Set(explicit.flat())]
    .map((name) => ({ name, aliases: artistAliases(name) }))
    .filter((artist) => artist.aliases.length)
    .sort((a, b) => b.aliases[0].length - a.aliases[0].length || a.name.localeCompare(b.name));

  return movies.map((movie, index) => {
    const artists = explicit[index].length ? explicit[index] : artistsFromKnownNames(movie, knownArtists);
    return { ...movie, artists };
  });
}
