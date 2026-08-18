/**
 * TMDB API Client для SerialFinder
 * Обёртка над The Movie Database API v3
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

    // === Жанры ===

    let genreCache = null;

    async function getGenres() {
        if (genreCache) return genreCache;
        const data = await request('/genre/tv/list');
        genreCache = data.genres;
        return genreCache;
    }

    function clearGenreCache() { genreCache = null; }

    // === Discover (поиск с фильтрами) ===

    const SORT_MAP = {
        'rating-desc':     'vote_average.desc',
        'rating-asc':      'vote_average.asc',
        'year-desc':       'first_air_date.desc',
        'year-asc':        'first_air_date.asc',
        'title-asc':       'name.asc',
        'title-desc':      'name.desc',
        'seasons-desc':    'popularity.desc',
        'seasons-asc':     'popularity.asc',
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
            params['first_air_date.gte'] = `${options.yearFrom}-01-01`;
        }
        if (options.yearTo && options.yearTo < new Date().getFullYear() + 1) {
            params['first_air_date.lte'] = `${options.yearTo}-12-31`;
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
        if (options.status === 'ended') params.with_status = '3|4';
        else if (options.status === 'running') params.with_status = '0';

        return request('/discover/tv', params);
    }

    // === Случайный популярный сериал ===
    async function getRandomSeries() {
        const randomPage = Math.floor(Math.random() * 5) + 1;
        const res = await discover({ page: randomPage, minRating: 7.5, sort: 'popularity-desc' });
        const list = res.results || [];
        if (list.length === 0) return null;
        const randomItem = list[Math.floor(Math.random() * list.length)];
        return getDetails(randomItem.id);
    }

    // === Похожие сериалы и рекомендации (для Swipe Check) ===
    async function getRecommendations(id, page = 1) {
        return request(`/tv/${id}/recommendations`, { page });
    }

    async function getSimilar(id, page = 1) {
        return request(`/tv/${id}/similar`, { page });
    }

    // === Поиск по тексту ===

    async function search(query, page = 1) {
        return request('/search/tv', { query, page });
    }

    // === Детали сериала ===

    const detailsCache = new Map();

    async function getDetails(id) {
        if (detailsCache.has(id)) return detailsCache.get(id);
        const details = await request(`/tv/${id}`, {
            append_to_response: 'external_ids'
        });
        detailsCache.set(id, details);
        return details;
    }

    function getCachedDetails(id) {
        return detailsCache.get(id) || null;
    }

    // === Маппинг стран ===

    const COUNTRY_CODES = {
        'США': 'US', 'Великобритания': 'GB', 'Россия': 'RU', 'Канада': 'CA',
        'Германия': 'DE', 'Франция': 'FR', 'Испания': 'ES', 'Италия': 'IT',
        'Южная Корея': 'KR', 'Япония': 'JP', 'Китай': 'CN', 'Турция': 'TR',
        'Австралия': 'AU', 'Норвегия': 'NO', 'Швеция': 'SE', 'Дания': 'DK',
        'Финляндия': 'FI', 'Исландия': 'IS', 'Ирландия': 'IE', 'Нидерланды': 'NL',
        'Бельгия': 'BE', 'Австрия': 'AT', 'Швейцария': 'CH', 'Польша': 'PL',
        'Чехия': 'CZ', 'Словакия': 'SK', 'Венгрия': 'HU', 'Румыния': 'RO',
        'Болгария': 'BG', 'Сербия': 'RS', 'Хорватия': 'HR', 'Греция': 'GR',
        'Португалия': 'PT', 'Украина': 'UA', 'Израиль': 'IL', 'Индия': 'IN',
        'Бразилия': 'BR', 'Мексика': 'MX', 'Аргентина': 'AR', 'Колумбия': 'CO',
        'Чили': 'CL', 'Перу': 'PE', 'Тайвань': 'TW', 'Таиланд': 'TH',
        'Сингапур': 'SG', 'Филиппины': 'PH', 'Индонезия': 'ID', 'Малайзия': 'MY',
        'Вьетнам': 'VN', 'Гонконг': 'HK', 'ЮАР': 'ZA', 'Египет': 'EG',
        'Новая Зеландия': 'NZ', 'Иран': 'IR', 'ОАЭ': 'AE', 'Саудовская Аравия': 'SA',
        'Нигерия': 'NG'
    };

    const CODE_TO_COUNTRY = Object.fromEntries(
        Object.entries(COUNTRY_CODES).map(([name, code]) => [code, name])
    );

    function countryName(code) { return CODE_TO_COUNTRY[code] || code; }
    function countryCode(name) { return COUNTRY_CODES[name] || name; }

    // === Маппинг данных TMDB → формат карточки ===

    const TMDB_GENRE_SPLIT = {
        10759: ['Боевик', 'Приключения'],
        10765: ['Научная фантастика', 'Фэнтези'],
        10768: ['Война', 'Политика'],
        9648: ['Детектив', 'Мистика'],
        18: ['Драма'],
        35: ['Комедия'],
        80: ['Криминал'],
        99: ['Документальный'],
        10751: ['Семейный'],
        10762: ['Детский'],
        10764: ['Реалити-шоу'],
        10766: ['Мелодрама'],
        10767: ['Ток-шоу'],
        37: ['Вестерн'],
        16: ['Анимация'],
    };

    function mapShow(tmdbShow, genreMap = {}) {
        const year = tmdbShow.first_air_date
            ? parseInt(tmdbShow.first_air_date.split('-')[0])
            : null;
        
        // Разделяем жанры на самостоятельные категории
        const genreIds = tmdbShow.genre_ids || [];
        const genres = [];
        genreIds.forEach(id => {
            if (TMDB_GENRE_SPLIT[id]) {
                genres.push(...TMDB_GENRE_SPLIT[id]);
            } else if (genreMap[id]) {
                genres.push(genreMap[id]);
            }
        });
        const uniqueGenres = [...new Set(genres)];
        const countries = (tmdbShow.origin_country || []).map(c => countryName(c));

        return {
            id: tmdbShow.id,
            title: tmdbShow.original_name || tmdbShow.name || '',
            titleRu: tmdbShow.name || tmdbShow.original_name || '',
            year, endYear: null, seasons: null, episodes: null,
            genres: uniqueGenres, country: countries[0] || '', countries,
            avgRating: Math.round((tmdbShow.vote_average || 0) * 10) / 10,
            imdbRating: null, kpRating: null,
            description: tmdbShow.overview || '',
            poster: posterUrl(tmdbShow.poster_path),
            imdbUrl: '', kpUrl: '', status: '',
            // Raw properties for precise category classification
            originalLanguage: tmdbShow.original_language || '',
            genreIds: genreIds,
            originCountry: tmdbShow.origin_country || [],
        };
    }

    function mapDetails(details) {
        const year = details.first_air_date
            ? parseInt(details.first_air_date.split('-')[0]) : null;
        const endYear = details.last_air_date && details.status !== 'Returning Series'
            ? parseInt(details.last_air_date.split('-')[0]) : null;
        const genres = (details.genres || []).map(g => g.name);
        const genreIds = (details.genres || []).map(g => g.id);
        const countries = (details.origin_country || []).map(c => countryName(c));
        const statusMap = {
            'Returning Series': 'Выходит', 'Ended': 'Завершён',
            'Canceled': 'Отменён', 'In Production': 'В производстве',
        };
        const imdbId = details.external_ids?.imdb_id || '';

        return {
            id: details.id,
            title: details.original_name || details.name || '',
            titleRu: details.name || details.original_name || '',
            year, endYear,
            seasons: details.number_of_seasons || 0,
            episodes: details.number_of_episodes || 0,
            genres, country: countries[0] || '', countries,
            avgRating: Math.round((details.vote_average || 0) * 10) / 10,
            imdbRating: null, kpRating: null,
            description: details.overview || '',
            poster: posterUrl(details.poster_path),
            imdbUrl: imdbId ? `https://www.imdb.com/title/${imdbId}/` : '',
            kpUrl: details.name ? `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(details.name)}` : '',
            status: statusMap[details.status] || details.status || '',
            networks: (details.networks || []).map(n => n.name),
            voteCount: details.vote_count || 0,
            originalLanguage: details.original_language || '',
            genreIds: genreIds,
            originCountry: details.origin_country || [],
        };
    }

    // === Утилита для дат ===
    function formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    // === Популярные (трендовые) ===
    async function trending(timeWindow = 'week', page = 1) {
        return request(`/trending/tv/${timeWindow}`, { page });
    }

    // === Новинки: недавно вышедшие + скоро выйдут ===
    async function newReleases(page = 1) {
        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        const monthAhead = new Date(today);
        monthAhead.setMonth(monthAhead.getMonth() + 1);

        return request('/discover/tv', {
            'first_air_date.gte': formatDate(monthAgo),
            'first_air_date.lte': formatDate(monthAhead),
            sort_by: 'popularity.desc',
            page,
            'vote_count.gte': 3,
        });
    }

    // === Вышедшие сезоны (завершённые недавно) ===
    async function recentlyCompleted(page = 1) {
        const today = new Date();
        const threeMonthsAgo = new Date(today);
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        return request('/discover/tv', {
            'air_date.lte': formatDate(today),
            'air_date.gte': formatDate(threeMonthsAgo),
            sort_by: 'vote_count.desc',
            page,
            'vote_count.gte': 20,
            with_status: '3|4', // Ended or Cancelled
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
        discover, search, getDetails, getCachedDetails,
        trending, newReleases, recentlyCompleted, getRandomSeries,
        getRecommendations, getSimilar,
        COUNTRY_CODES, CODE_TO_COUNTRY, countryName, countryCode,
        mapShow, mapDetails, calculateSmartRating,
    };
})();

if (typeof module !== 'undefined') module.exports = TMDB;
