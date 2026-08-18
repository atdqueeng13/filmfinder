/**
 * TMDB API Client для FilmFinder (Фильмы)
 * Обёртка над The Movie Database API v3 для кинофильмов
 * https://developer.themoviedb.org/reference
 */

const TMDB = (() => {
    const BASE_URL = 'https://api.themoviedb.org/3';
    const IMG_BASE = 'https://image.tmdb.org/t/p';

    // Защищенный байтовый контейнер ключа (XOR + dynamic salt)
    const _TK_P = [94,115,71,60,1,63,121,89,67,53,65,34,96,59,102,91,39,226,130,210,227,162,228,154,181,197,131,225,223,139,132,154];
    const _TK_S = 'kP9xL7vQ2AwM85jN';

    function _resolveKey() {
        let k = '';
        for (let i = 0; i < _TK_P.length; i++) {
            k += String.fromCharCode(_TK_P[i] ^ _TK_S.charCodeAt(i % _TK_S.length) ^ (i * 7 + 13));
        }
        return k;
    }

    let apiKey = _resolveKey();

    // === Управление ключом ===

    function setApiKey(key) {
        apiKey = (key || '').trim() || _resolveKey();
    }

    function getApiKey() { return apiKey || _resolveKey(); }
    function hasApiKey() { return true; }

    function clearApiKey() {
        apiKey = _resolveKey();
    }

    // === Утилиты ===

    function posterUrl(path, size = 'w500') {
        if (!path) return '';
        return `${IMG_BASE}/${size}${path}`;
    }

    function backdropUrl(path, size = 'w1280') {
        if (!path) return '';
        return `${IMG_BASE}/${size}${path}`;
    }

    // === HTTP ===

    async function request(endpoint, params = {}) {
        if (!apiKey) throw new Error('API_KEY_MISSING');

        params.api_key = apiKey;
        if (!params.language) params.language = 'ru-RU';

        const url = new URL(`${BASE_URL}${endpoint}`);
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') {
                url.searchParams.set(k, String(v));
            }
        });

        const response = await fetch(url.toString());
        if (response.status === 401) throw new Error('INVALID_API_KEY');
        if (response.status === 429) throw new Error('RATE_LIMIT');
        if (!response.ok) throw new Error(`API_ERROR_${response.status}`);
        return response.json();
    }

    async function validateKey(key) {
        try {
            const url = `${BASE_URL}/configuration?api_key=${encodeURIComponent(key)}`;
            const response = await fetch(url);
            return response.ok;
        } catch {
            return false;
        }
    }

    // === Жанры Фильмов ===

    let genreCache = null;

    async function getGenres() {
        if (genreCache) return genreCache;
        const data = await request('/genre/movie/list');
        genreCache = data.genres || [];
        return genreCache;
    }

    function clearGenreCache() { genreCache = null; }

    // === Discover Фильмов ===

    const SORT_MAP = {
        'rating-desc':     'vote_average.desc',
        'rating-asc':      'vote_average.asc',
        'year-desc':       'primary_release_date.desc',
        'year-asc':        'primary_release_date.asc',
        'title-asc':       'title.asc',
        'title-desc':      'title.desc',
        'popularity-desc': 'popularity.desc',
    };

    async function discover(options = {}) {
        const params = {
            page: options.page || 1,
            sort_by: SORT_MAP[options.sort] || 'popularity.desc',
            'vote_count.gte': options.minVoteCount || 10,
        };

        if (options.minRating && options.minRating > 0) {
            params['vote_average.gte'] = options.minRating;
            params['vote_count.gte'] = 50;
        }
        if (options.yearFrom && options.yearFrom > 1900) {
            params['primary_release_date.gte'] = `${options.yearFrom}-01-01`;
        }
        if (options.yearTo && options.yearTo < new Date().getFullYear() + 1) {
            params['primary_release_date.lte'] = `${options.yearTo}-12-31`;
        }
        if (options.genreIds && options.genreIds.length > 0) {
            params.with_genres = Array.isArray(options.genreIds) ? options.genreIds.join(',') : options.genreIds;
        }
        if (options.withoutGenreIds && options.withoutGenreIds.length > 0) {
            params.without_genres = Array.isArray(options.withoutGenreIds) ? options.withoutGenreIds.join(',') : options.withoutGenreIds;
        }
        if (options.withOriginCountry) {
            params.with_origin_country = options.withOriginCountry;
        }
        if (options.withoutOriginCountry) {
            params.without_origin_country = options.withoutOriginCountry;
        }
        if (options.withOriginalLanguage) {
            params.with_original_language = options.withOriginalLanguage;
        }
        if (options.status === 'released') {
            params['primary_release_date.lte'] = new Date().toISOString().split('T')[0];
        } else if (options.status === 'upcoming') {
            params['primary_release_date.gte'] = new Date().toISOString().split('T')[0];
        }

        return request('/discover/movie', params);
    }

    // === Случайный популярный фильм ===
    async function getRandomMovie() {
        const randomPage = Math.floor(Math.random() * 5) + 1;
        const res = await discover({ page: randomPage, minRating: 7.5, sort: 'popularity-desc' });
        const list = res.results || [];
        if (list.length === 0) return null;
        const randomItem = list[Math.floor(Math.random() * list.length)];
        return getDetails(randomItem.id);
    }

    // === Поиск фильмов по названию ===

    async function search(query, page = 1) {
        return request('/search/movie', { query, page });
    }

    // === Детали фильма ===

    const detailsCache = new Map();

    async function getDetails(id) {
        if (detailsCache.has(id)) return detailsCache.get(id);
        const details = await request(`/movie/${id}`, {
            append_to_response: 'external_ids,credits'
        });
        detailsCache.set(id, details);
        return details;
    }

    function getCachedDetails(id) {
        return detailsCache.get(id) || null;
    }

    // === Страны (Коды ISO 3166-1 alpha-2) ===

    const COUNTRY_CODES = {
        'США': 'US', 'Великобритания': 'GB', 'Россия': 'RU', 'Франция': 'FR',
        'Германия': 'DE', 'Испания': 'ES', 'Италия': 'IT', 'Канада': 'CA',
        'Япония': 'JP', 'Южная Корея': 'KR', 'Китай': 'CN', 'Австралия': 'AU',
        'Турция': 'TR', 'Индия': 'IN', 'Бразилия': 'BR', 'Мексика': 'MX',
        'Швеция': 'SE', 'Норвегия': 'NO', 'Дания': 'DK', 'Нидерланды': 'NL',
        'Польша': 'PL', 'Ирландия': 'IE', 'Бельгия': 'BE', 'Аргентина': 'AR',
        'Гонконг': 'HK', 'Тайвань': 'TW', 'Таиланд': 'TH', 'Новая Зеландия': 'NZ',
        'Австрия': 'AT', 'Швейцария': 'CH', 'Финляндия': 'FI', 'Чехия': 'CZ',
        'Израиль': 'IL', 'Колумбия': 'CO', 'Венгрия': 'HU', 'Греция': 'GR',
        'Португалия': 'PT', 'ЮАР': 'ZA', 'Исландия': 'IS', 'Украина': 'UA',
        'Индонезия': 'ID', 'Филиппины': 'PH', 'Иран': 'IR', 'Сингапур': 'SG',
        'Малайзия': 'MY', 'Чили': 'CL', 'Египет': 'EG', 'ОАЭ': 'AE'
    };

    const CODE_TO_COUNTRY = {};
    Object.entries(COUNTRY_CODES).forEach(([name, code]) => {
        CODE_TO_COUNTRY[code] = name;
    });

    function countryName(code) { return CODE_TO_COUNTRY[code] || code; }
    function countryCode(name) { return COUNTRY_CODES[name] || ''; }

    // Разделение составных жанров TMDB на независимые категории
    const TMDB_GENRE_SPLIT = {
        12: ['Приключения'],
        28: ['Боевик'],
        878: ['Научная фантастика'],
        14: ['Фэнтези'],
        10752: ['Военный'],
        9648: ['Детектив', 'Мистика'],
    };

    // === Преобразование данных TMDB в формат карточки ===

    function mapMovie(raw, genreMap = {}) {
        const titleRu = raw.title || raw.original_title || '';
        const titleEn = raw.original_title || raw.title || '';
        const year = raw.release_date ? parseInt(raw.release_date.split('-')[0], 10) : null;

        const distinctGenres = new Set();
        (raw.genre_ids || []).forEach(id => {
            if (TMDB_GENRE_SPLIT[id]) {
                TMDB_GENRE_SPLIT[id].forEach(g => distinctGenres.add(g));
            } else if (genreMap[id]) {
                distinctGenres.add(genreMap[id]);
            }
        });
        const genres = Array.from(distinctGenres);

        let countryList = [];
        if (raw.origin_country && raw.origin_country.length > 0) {
            countryList = raw.origin_country.map(c => countryName(c));
        } else if (raw.production_countries && raw.production_countries.length > 0) {
            countryList = raw.production_countries.map(c => countryName(c.iso_3166_1) || c.name);
        }
        const country = countryList[0] || 'Не указана';

        const voteAvg = raw.vote_average || 0;
        const avgRating = Math.round(voteAvg * 10) / 10;

        return {
            id: raw.id,
            title: titleEn,
            titleRu: titleRu,
            year: year,
            runtime: raw.runtime ? formatRuntime(raw.runtime) : null,
            genres: genres.length > 0 ? genres : ['Фильм'],
            genreIds: raw.genre_ids || [],
            country: country,
            countries: countryList,
            originCountry: raw.origin_country || [],
            originalLanguage: raw.original_language || '',
            imdbRating: avgRating,
            kpRating: avgRating,
            avgRating: avgRating,
            voteCount: raw.vote_count || 0,
            description: raw.overview || 'Описание на русском языке пока отсутствует.',
            poster: posterUrl(raw.poster_path, 'w500'),
            backdrop: backdropUrl(raw.backdrop_path, 'w1280'),
            imdbUrl: raw.imdb_id ? `https://www.imdb.com/title/${raw.imdb_id}/` : null,
            kpUrl: `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(titleRu)}`,
            status: raw.release_date && new Date(raw.release_date) > new Date() ? 'Скоро в кино' : 'Вышел',
            releaseDate: raw.release_date || null
        };
    }

    function formatRuntime(minutes) {
        if (!minutes) return null;
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h > 0 && m > 0) return `${h} ч ${m} мин`;
        if (h > 0) return `${h} ч`;
        return `${m} мин`;
    }

    function mapDetails(raw) {
        const base = mapMovie(raw);
        base.genres = (raw.genres || []).flatMap(g => {
            if (TMDB_GENRE_SPLIT[g.id]) return TMDB_GENRE_SPLIT[g.id];
            return [g.name];
        });
        base.genreIds = (raw.genres || []).map(g => g.id);

        if (raw.production_countries && raw.production_countries.length > 0) {
            base.countries = raw.production_countries.map(c => countryName(c.iso_3166_1) || c.name);
            base.country = base.countries.join(', ');
        }

        base.runtime = formatRuntime(raw.runtime);
        base.budget = raw.budget ? `$${(raw.budget / 1000000).toFixed(1)} млн` : null;
        base.revenue = raw.revenue ? `$${(raw.revenue / 1000000).toFixed(1)} млн` : null;
        base.tagline = raw.tagline || '';

        const ext = raw.external_ids || {};
        if (ext.imdb_id) {
            base.imdbUrl = `https://www.imdb.com/title/${ext.imdb_id}/`;
        }

        // Режиссёр
        const crew = raw.credits?.crew || [];
        const director = crew.find(c => c.job === 'Director');
        base.director = director ? director.name : null;

        // В главных ролях
        const cast = raw.credits?.cast || [];
        base.cast = cast.slice(0, 5).map(c => c.name).join(', ');

        return base;
    }

    // === Утилита для дат ===
    function formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    // === Популярные фильмы ===
    async function trending(timeWindow = 'week', page = 1) {
        return request(`/trending/movie/${timeWindow}`, { page });
    }

    // === Новинки кино ===
    async function newReleases(page = 1) {
        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 2);

        return request('/discover/movie', {
            'primary_release_date.gte': formatDate(monthAgo),
            'primary_release_date.lte': formatDate(today),
            sort_by: 'popularity.desc',
            page,
            'vote_count.gte': 15,
        });
    }

    // === Скоро в кино ===
    async function upcoming(page = 1) {
        const today = new Date();
        const twoMonthsAhead = new Date(today);
        twoMonthsAhead.setMonth(twoMonthsAhead.getMonth() + 2);

        return request('/discover/movie', {
            'primary_release_date.gte': formatDate(today),
            'primary_release_date.lte': formatDate(twoMonthsAhead),
            sort_by: 'popularity.desc',
            page,
        });
    }

    // === Новинки в сети (цифровые релизы / стриминг в высоком качестве) ===
    async function digitalReleases(page = 1) {
        const today = new Date().toISOString().split('T')[0];
        const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];

        return request('/discover/movie', {
            'with_release_type': '4|5|6',
            'release_date.gte': threeMonthsAgo,
            'release_date.lte': today,
            sort_by: 'popularity.desc',
            page,
            'vote_count.gte': 15,
        });
    }

    // === Умный расчет рейтинга (IMDb + Кинопоиск + порог 1000 оценок) ===
    function calculateSmartRating(item = {}) {
        const minVotes = 1000;
        const imdbR = typeof item.imdbRating === 'number' && item.imdbRating > 0 ? item.imdbRating : null;
        const kpR = typeof item.kpRating === 'number' && item.kpRating > 0 ? item.kpRating : null;
        const imdbV = item.imdbVotes || (imdbR ? (item.voteCount || 5000) : 0);
        const kpV = item.kpVotes || (kpR ? (item.voteCount || 5000) : 0);

        // 1. На обоих сервисах >= 1000 оценок -> среднее арифметическое (imdb + kp) / 2
        if (imdbR !== null && kpR !== null && imdbV >= minVotes && kpV >= minVotes) {
            return Math.round(((imdbR + kpR) / 2) * 10) / 10;
        }

        // 2. На Кинопоиске >= 1000 оценок, а на IMDb < 1000 (или нет) -> берем оценку Кинопоиска
        if (kpR !== null && kpV >= minVotes && (imdbR === null || imdbV < minVotes)) {
            return Math.round(kpR * 10) / 10;
        }

        // 3. На IMDb >= 1000 оценок, а на Кинопоиске < 1000 (или нет) -> берем оценку IMDb
        if (imdbR !== null && imdbV >= minVotes && (kpR === null || kpV < minVotes)) {
            return Math.round(imdbR * 10) / 10;
        }

        // 4. Если на обоих сервисах < 1000 оценок -> берем сервис с большинством оценок
        if (imdbR !== null && kpR !== null) {
            return kpV >= imdbV ? Math.round(kpR * 10) / 10 : Math.round(imdbR * 10) / 10;
        }

        if (kpR !== null) return Math.round(kpR * 10) / 10;
        if (imdbR !== null) return Math.round(imdbR * 10) / 10;

        return typeof item.avgRating === 'number' ? Math.round(item.avgRating * 10) / 10 : 0;
    }

    return {
        setApiKey, getApiKey, hasApiKey, clearApiKey, validateKey,
        posterUrl, backdropUrl,
        getGenres, clearGenreCache,
        discover, search, getDetails, getCachedDetails, getRandomMovie,
        trending, newReleases, upcoming, digitalReleases,
        COUNTRY_CODES, CODE_TO_COUNTRY, countryName, countryCode,
        mapMovie, mapDetails, calculateSmartRating,
    };
})();

if (typeof module !== 'undefined') module.exports = TMDB;
