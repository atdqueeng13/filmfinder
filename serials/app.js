/**
 * SerialFinder — Главное приложение
 * Двойной режим: TMDB API (170 000+ сериалов) / Локальная база (120 сериалов)
 * Поддержка категорий: Сериалы, Аниме, Мультсериалы, Дорамы + Случайный сериал.
 */
function startApp() {
    // ==================== СОСТОЯНИЕ ====================
    const localData = window.SERIES_DATA || [];
    let isAPIMode = true;
    let genreMap = {};        // id → name (для API)
    let genreReverseMap = {}; // name → id (для API)
    let currentResults = [];  // текущие отображаемые результаты
    let allLoadedResults = []; // все загруженные результаты (для пагинации)

    const BATCH_SIZE = 24; // Кратность 4 (десктоп), 3 (планшет), 2 (мобильный)
    let currentApiPage = 1;
    let resultsBuffer = [];

    // Пользовательские настройки категорий (изначально выбран только раздел "Сериалы")
    const defaultContentPrefs = {
        series: true,
        anime: false,
        cartoons: false,
        doramas: false
    };
    let contentPrefs = JSON.parse(localStorage.getItem('serialfinder-content-prefs') || 'null');
    if (!contentPrefs) {
        contentPrefs = { ...defaultContentPrefs };
    }

    const state = {
        search: '',
        genres: [],           // названия жанров (для локального) или id (для API)
        genreNames: [],       // всегда названия — для отображения
        yearFrom: 1950,
        yearTo: new Date().getFullYear(),
        minSeasons: 1,
        minRating: 0,
        includeCountries: [], // выбранные страны производства
        excludeCountries: [], // исключаемые страны
        status: 'all',        // 'all' | 'ended' | 'running'
        sort: 'popularity-desc',
        theme: localStorage.getItem('serialfinder-theme') || 'dark',
        page: 1,
        totalPages: 1,
        loading: false,
        featuredTab: 'popular',    // 'popular' | 'new'
        featuredSubtab: 'upcoming', // 'upcoming' | 'released'
    };

    // ==================== РАЗДЕЛЬНЫЕ ЖАНРЫ ====================
    const ALL_GENRES = [
        'Боевик', 'Приключения', 'Научная фантастика', 'Фэнтези', 'Война', 'Политика',
        'Драма', 'Комедия', 'Криминал', 'Детектив', 'Мистика', 'Триллер', 'Ужасы',
        'Мелодрама', 'Семейный', 'Документальный', 'Анимация', 'Биография',
        'Исторический', 'Вестерн', 'Музыка', 'Детский', 'Реалити-шоу', 'Ток-шоу'
    ];

    const GENRE_NAME_TO_IDS = {
        'Боевик': [10759],
        'Приключения': [10759],
        'Научная фантастика': [10765],
        'Фэнтези': [10765],
        'Война': [10768],
        'Политика': [10768],
        'Детектив': [9648],
        'Мистика': [9648],
        'Драма': [18],
        'Комедия': [35],
        'Криминал': [80],
        'Документальный': [99],
        'Семейный': [10751],
        'Детский': [10762],
        'Реалити-шоу': [10764],
        'Мелодрама': [10766],
        'Ток-шоу': [10767],
        'Вестерн': [37],
        'Анимация': [16],
        'Ужасы': [27, 53],
        'Триллер': [53],
        'Музыка': [10402],
        'Исторический': [36],
        'Биография': [36],
    };

    // ==================== ХЕЛПЕРЫ КЛАССИФИКАЦИИ ====================
    const WESTERN_ANIME_KEYWORDS = [
        'аватар', 'avatar', 'легенда об аанге', 'the last airbender',
        'легенда о корре', 'legend of korra',
        'кастлвания', 'castlevania',
        'киберпанк', 'cyberpunk: edgerunners', 'edgerunners',
        'голубоглазый самурай', 'blue eye samurai',
        'кровь зевса', 'blood of zeus',
        'dota: кровь дракона', 'dota: dragon',
        'rwby', 'скотт пилигрим', 'scott pilgrim',
        'капитан лазерхок', 'captain laserhawk',
        'афросамурай', 'afro samurai',
        'вольтрон', 'voltron', 'лара крофт', 'tomb raider',
        'тресе', 'trese', 'seis manos', 'терминатор зеро', 'terminator zero',
        'devil may cry', 'onimusha', 'tekken', 'dragon age: absolution'
    ];

    function isAnimeShow(s) {
        const isAnim = (s.genreIds && s.genreIds.includes(16)) || (s.genres && s.genres.includes('Анимация'));
        if (!isAnim) return false;

        // 1. Азиатское происхождение (Япония, Китай, Южная Корея, Тайвань, Гонконг)
        const isAsianOrigin = 
            s.originalLanguage === 'ja' || 
            s.originalLanguage === 'zh' || 
            s.originalLanguage === 'ko' || 
            (s.originCountry && (s.originCountry.includes('JP') || s.originCountry.includes('CN') || s.originCountry.includes('KR') || s.originCountry.includes('TW') || s.originCountry.includes('HK'))) ||
            (s.countries && (s.countries.includes('Япония') || s.countries.includes('Китай') || s.countries.includes('Южная Корея') || s.countries.includes('Тайвань') || s.countries.includes('Гонконг'))) ||
            s.country === 'Япония' || s.country === 'Китай' || s.country === 'Южная Корея';

        if (isAsianOrigin) return true;

        // 2. Западное аниме и аниме-стиль (Аватар, Кастлвания, Киберпанк и др.)
        const titleRu = (s.titleRu || '').toLowerCase();
        const titleEn = (s.title || '').toLowerCase();
        const isWesternAnime = WESTERN_ANIME_KEYWORDS.some(k => titleRu.includes(k) || titleEn.includes(k));
        if (isWesternAnime) return true;

        return false;
    }

    function isCartoonShow(s) {
        const isAnim = (s.genreIds && s.genreIds.includes(16)) || (s.genres && s.genres.includes('Анимация'));
        if (!isAnim) return false;
        // Всё, что не относится к аниме/дунхуа/азиатской анимации, является классическими мультсериалами
        return !isAnimeShow(s);
    }

    function isDoramaShow(s) {
        const isAnim = (s.genreIds && s.genreIds.includes(16)) || (s.genres && s.genres.includes('Анимация'));
        if (isAnim) return false; // Анимация попадает в аниме, а не в дорамы

        const isAsianDrama = 
            s.originalLanguage === 'ko' || 
            s.originalLanguage === 'zh' || 
            (s.originCountry && (s.originCountry.includes('KR') || s.originCountry.includes('CN') || s.originCountry.includes('TW') || s.originCountry.includes('TH'))) ||
            (s.countries && (s.countries.includes('Южная Корея') || s.countries.includes('Китай') || s.countries.includes('Тайвань') || s.countries.includes('Таиланд'))) ||
            s.country === 'Южная Корея' || s.country === 'Китай';

        return isAsianDrama;
    }

    function isShowAllowed(series) {
        const hasSeries = !!contentPrefs.series;
        const hasAnime = !!contentPrefs.anime;
        const hasCartoons = !!contentPrefs.cartoons;
        const hasDoramas = !!contentPrefs.doramas;

        // Если включены все 4 категории — разрешаем любой сериал
        if (hasSeries && hasAnime && hasCartoons && hasDoramas) return true;

        const isAnime = isAnimeShow(series);
        const isCartoon = isCartoonShow(series);
        const isDorama = isDoramaShow(series);
        const isLiveAction = !isAnime && !isCartoon && !isDorama;

        if (isAnime && hasAnime) return true;
        if (isCartoon && hasCartoons) return true;
        if (isDorama && hasDoramas) return true;
        if (isLiveAction && hasSeries) return true;

        return false;
    }

    // ==================== DOM-ЭЛЕМЕНТЫ ====================
    const el = {
        app: document.getElementById('app'),
        searchInput: document.getElementById('searchInput'),
        themeToggle: document.getElementById('themeToggle'),
        sidebarToggle: document.getElementById('sidebarToggle'),
        sidebarOverlay: document.getElementById('sidebarOverlay'),
        sidebar: document.getElementById('sidebar'),
        resetFilters: document.getElementById('resetFilters'),
        applyFiltersBtn: document.getElementById('applyFiltersBtn'),
        genresFilter: document.getElementById('genresFilter'),
        genresSearchInput: document.getElementById('genresSearchInput'),
        countriesIncludeFilter: document.getElementById('countriesIncludeFilter'),
        includeCountriesSearchInput: document.getElementById('includeCountriesSearchInput'),
        countriesExcludeFilter: document.getElementById('countriesExcludeFilter'),
        excludeCountriesSearchInput: document.getElementById('excludeCountriesSearchInput'),
        yearFromInput: document.getElementById('yearFromInput'),
        yearToInput: document.getElementById('yearToInput'),
        yearFromManual: document.getElementById('yearFromManual'),
        yearToManual: document.getElementById('yearToManual'),
        minSeasonsInput: document.getElementById('minSeasonsInput'),
        minSeasonsManual: document.getElementById('minSeasonsManual'),
        minRatingInput: document.getElementById('minRatingInput'),
        minRatingManual: document.getElementById('minRatingManual'),
        statusRadios: document.querySelectorAll('input[name="status"]'),
        sortSelect: document.getElementById('sortSelect'),
        resultsCount: document.getElementById('resultsCount'),
        seriesGrid: document.getElementById('seriesGrid'),
        noResults: document.getElementById('noResults'),
        modalOverlay: document.getElementById('modalOverlay'),
        modalClose: document.getElementById('modalClose'),
        modalBody: document.getElementById('modalBody'),
        filterGroups: document.querySelectorAll('.filter-group'),
        // API Key Modal
        apiKeyModal: document.getElementById('apiKeyModal'),
        apiKeyInput: document.getElementById('apiKeyInput'),
        apiKeySubmit: document.getElementById('apiKeySubmit'),
        apiKeySkip: document.getElementById('apiKeySkip'),
        apiKeyError: document.getElementById('apiKeyError'),
        modeBadge: document.getElementById('modeBadge'),
        modeBadgeText: document.getElementById('modeBadgeText'),
        loadingSpinner: document.getElementById('loadingSpinner'),
        loadMoreContainer: document.getElementById('loadMoreContainer'),
        loadMoreBtn: document.getElementById('loadMoreBtn'),
        loadMoreInfo: document.getElementById('loadMoreInfo'),
        changeApiKey: document.getElementById('changeApiKey'),
        changeApiKeyText: document.getElementById('changeApiKeyText'),
        // Content Preferences Modal
        contentPrefsModal: document.getElementById('contentPrefsModal'),
        openContentPrefsBtn: document.getElementById('openContentPrefsBtn'),
        sidebarContentPrefsBtn: document.getElementById('sidebarContentPrefsBtn'),
        saveContentPrefsBtn: document.getElementById('saveContentPrefsBtn'),
        prefSeries: document.getElementById('prefSeries'),
        prefAnime: document.getElementById('prefAnime'),
        prefCartoons: document.getElementById('prefCartoons'),
        prefDoramas: document.getElementById('prefDoramas'),
        // Featured section
        featuredSection: document.getElementById('featuredSection'),
        featuredCarousel: document.getElementById('featuredCarousel'),
        featuredArrowLeft: document.getElementById('featuredArrowLeft'),
        featuredArrowRight: document.getElementById('featuredArrowRight'),
        featuredLoading: document.getElementById('featuredLoading'),
        featuredSubtabs: document.getElementById('featuredSubtabs'),
        // Navigation & Random
        categoryNav: document.getElementById('categoryNav'),
        randomSeriesBtn: document.getElementById('randomSeriesBtn'),
        // AI Request Elements
        aiSearchBtn: document.getElementById('aiSearchBtn'),
        aiModalOverlay: document.getElementById('aiModalOverlay'),
        aiModalClose: document.getElementById('aiModalClose'),
        aiKeySection: document.getElementById('aiKeySection'),
        geminiApiKeyInput: document.getElementById('geminiApiKeyInput'),
        saveGeminiKeyBtn: document.getElementById('saveGeminiKeyBtn'),
        aiQueryInput: document.getElementById('aiQueryInput'),
        aiVoiceBtn: document.getElementById('aiVoiceBtn'),
        aiSubmitBtn: document.getElementById('aiSubmitBtn'),
        aiLoading: document.getElementById('aiLoading'),
        aiError: document.getElementById('aiError'),
        aiResults: document.getElementById('aiResults'),
        aiResultsGrid: document.getElementById('aiResultsGrid'),
        aiResetSearchBtn: document.getElementById('aiResetSearchBtn'),
        toggleAiKeyBtn: document.getElementById('toggleAiKeyBtn'),
    };

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    async function init() {
        applyTheme();
        loadSavedContentPrefs();
        updateCategoryNavUI();
        setupEventListeners();

        const sortedCountries = Object.keys(TMDB.COUNTRY_CODES).sort((a, b) => a.localeCompare(b, 'ru'));

        await initAPIMode(sortedCountries);
    }

    async function initAPIMode(sortedCountries) {
        isAPIMode = true;
        updateModeBadge();

        showLoading(true);
        try {
            const genres = await TMDB.getGenres();
            genreMap = {};
            genreReverseMap = {};
            if (Array.isArray(genres)) {
                genres.forEach(g => {
                    genreMap[g.id] = g.name;
                    genreReverseMap[g.name] = g.id;
                });
            }
            setupGenreFilters(ALL_GENRES);
            setupCountryFilters(sortedCountries);

            if (el.featuredSection) el.featuredSection.style.display = 'block';

            await fetchAndRender(true);
            loadFeatured();
        } catch (err) {
            console.error('Ошибка в initAPIMode:', err);
            initLocalMode(sortedCountries);
        } finally {
            showLoading(false);
        }
    }

    function initLocalMode(sortedCountries) {
        isAPIMode = false;
        updateModeBadge();

        setupGenreFilters(ALL_GENRES);
        setupCountryFilters(sortedCountries);

        if (el.featuredSection) el.featuredSection.style.display = 'none';
        state.sort = 'rating-desc';
        el.sortSelect.value = 'rating-desc';

        applyLocalFiltersAndRender();
    }

    // ==================== НАСТРОЙКИ КОНТЕНТА ====================
    function loadSavedContentPrefs() {
        try {
            const stored = localStorage.getItem('serialfinder-content-prefs');
            if (stored) {
                contentPrefs = JSON.parse(stored);
            }
        } catch (e) {
            contentPrefs = null;
        }

        // Если настройки не заданы или все категории выключены — включаем "Сериалы" по умолчанию
        if (!contentPrefs || (!contentPrefs.series && !contentPrefs.anime && !contentPrefs.cartoons && !contentPrefs.doramas)) {
            contentPrefs = { ...defaultContentPrefs };
        }

        updatePrefsCheckboxes();
        updateCategoryNavUI();
    }

    function updatePrefsCheckboxes() {
        if (el.prefSeries) el.prefSeries.checked = !!contentPrefs.series;
        if (el.prefAnime) el.prefAnime.checked = !!contentPrefs.anime;
        if (el.prefCartoons) el.prefCartoons.checked = !!contentPrefs.cartoons;
        if (el.prefDoramas) el.prefDoramas.checked = !!contentPrefs.doramas;
    }

    function updateCategoryNavUI() {
        document.querySelectorAll('.category-nav__item').forEach(btn => {
            const cat = btn.dataset.category;
            if (cat === 'series') btn.classList.toggle('category-nav__item--active', !!contentPrefs.series);
            if (cat === 'anime') btn.classList.toggle('category-nav__item--active', !!contentPrefs.anime);
            if (cat === 'cartoons') btn.classList.toggle('category-nav__item--active', !!contentPrefs.cartoons);
            if (cat === 'doramas') btn.classList.toggle('category-nav__item--active', !!contentPrefs.doramas);
        });
    }

    function showContentPrefsModal() {
        updatePrefsCheckboxes();
        if (el.contentPrefsModal) el.contentPrefsModal.style.display = 'flex';
    }

    function hideContentPrefsModal() {
        if (el.contentPrefsModal) el.contentPrefsModal.style.display = 'none';
    }

    function saveContentPrefs() {
        contentPrefs = {
            series: el.prefSeries ? el.prefSeries.checked : true,
            anime: el.prefAnime ? el.prefAnime.checked : true,
            cartoons: el.prefCartoons ? el.prefCartoons.checked : true,
            doramas: el.prefDoramas ? el.prefDoramas.checked : true,
        };

        // Защита: если сняты все галочки, включаем все
        if (!contentPrefs.series && !contentPrefs.anime && !contentPrefs.cartoons && !contentPrefs.doramas) {
            contentPrefs = { ...defaultContentPrefs };
            updatePrefsCheckboxes();
        }

        localStorage.setItem('serialfinder-content-prefs', JSON.stringify(contentPrefs));
        updateCategoryNavUI();
        hideContentPrefsModal();
        triggerFilterChange();
    }

    // ==================== API KEY MODAL ====================
    function showApiKeyModal() {
        el.apiKeyModal.style.display = 'flex';
        el.apiKeyInput.focus();
    }

    function hideApiKeyModal() {
        el.apiKeyModal.style.display = 'none';
        el.apiKeyError.style.display = 'none';
        el.apiKeyInput.value = '';
    }

    async function submitApiKey() {
        const key = el.apiKeyInput.value.trim();
        if (!key) return;

        el.apiKeySubmit.disabled = true;
        el.apiKeySubmit.textContent = 'Проверка...';

        const valid = await TMDB.validateKey(key);
        if (valid) {
            TMDB.setApiKey(key);
            hideApiKeyModal();

            const storedPrefs = localStorage.getItem('serialfinder-content-prefs');
            if (!storedPrefs) {
                showContentPrefsModal();
            }

            const sortedCountries = Object.keys(TMDB.COUNTRY_CODES).sort((a, b) => a.localeCompare(b, 'ru'));
            await initAPIMode(sortedCountries);
        } else {
            el.apiKeyError.style.display = 'block';
        }

        el.apiKeySubmit.disabled = false;
        el.apiKeySubmit.textContent = 'Подключить';
    }

    // ==================== НАСТРОЙКА ФИЛЬТРОВ ====================
    function setupGenreFilters(genres) {
        el.genresFilter.innerHTML = genres.map(name => `
            <label class="checkbox-item">
                <input type="checkbox" class="checkbox-item__input" value="${name}" data-filter="genres">
                <span class="checkbox-item__checkmark"></span>
                <span class="checkbox-item__label">${name}</span>
            </label>
        `).join('');
    }

    function setupCountryFilters(countries) {
        const createCheckboxes = (filterType) => countries.map(name => `
            <label class="checkbox-item">
                <input type="checkbox" class="checkbox-item__input" value="${name}" data-filter="${filterType}">
                <span class="checkbox-item__checkmark"></span>
                <span class="checkbox-item__label">${name}</span>
            </label>
        `).join('');

        if (el.countriesIncludeFilter) {
            el.countriesIncludeFilter.innerHTML = createCheckboxes('include-countries');
        }
        if (el.countriesExcludeFilter) {
            el.countriesExcludeFilter.innerHTML = createCheckboxes('exclude-countries');
        }
    }

    function setupSearchFilter(inputEl, containerEl) {
        if (!inputEl || !containerEl) return;
        inputEl.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            containerEl.querySelectorAll('.checkbox-item').forEach(item => {
                const label = (item.querySelector('.checkbox-item__label')?.textContent || '').toLowerCase();
                if (!query || label.includes(query)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    // ==================== СОБЫТИЯ ====================
    function setupEventListeners() {
        // Тема
        el.themeToggle.addEventListener('click', () => {
            state.theme = state.theme === 'dark' ? 'light' : 'dark';
            applyTheme();
        });

        // Сайдбар (мобильный)
        el.sidebarToggle.addEventListener('click', () => {
            el.sidebar.classList.add('sidebar--open');
            el.sidebarOverlay.classList.add('sidebar__overlay--visible');
        });
        el.sidebarOverlay.addEventListener('click', () => {
            el.sidebar.classList.remove('sidebar--open');
            el.sidebarOverlay.classList.remove('sidebar__overlay--visible');
        });

        // Поиск с debounce
        let searchTimeout;
        el.searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                state.search = e.target.value.trim();
                triggerFilterChange();
            }, 350);
        });

        // Год: слайдеры и ручной ввод
        el.yearFromInput.addEventListener('input', (e) => {
            let val = parseInt(e.target.value, 10);
            if (val > state.yearTo) { val = state.yearTo; e.target.value = val; }
            state.yearFrom = val;
            if (el.yearFromManual) el.yearFromManual.value = val;
        });
        el.yearFromInput.addEventListener('change', triggerFilterChange);

        if (el.yearFromManual) {
            el.yearFromManual.addEventListener('input', (e) => {
                let val = parseInt(e.target.value, 10);
                if (isNaN(val)) val = 1950;
                if (val < 1950) val = 1950;
                if (val > state.yearTo) val = state.yearTo;
                state.yearFrom = val;
                el.yearFromInput.value = val;
            });
            el.yearFromManual.addEventListener('change', triggerFilterChange);
        }

        el.yearToInput.addEventListener('input', (e) => {
            let val = parseInt(e.target.value, 10);
            if (val < state.yearFrom) { val = state.yearFrom; e.target.value = val; }
            state.yearTo = val;
            if (el.yearToManual) el.yearToManual.value = val;
        });
        el.yearToInput.addEventListener('change', triggerFilterChange);

        if (el.yearToManual) {
            el.yearToManual.addEventListener('input', (e) => {
                let val = parseInt(e.target.value, 10);
                if (isNaN(val)) val = new Date().getFullYear();
                if (val < state.yearFrom) val = state.yearFrom;
                if (val > 2030) val = 2030;
                state.yearTo = val;
                el.yearToInput.value = Math.min(val, 2026);
            });
            el.yearToManual.addEventListener('change', triggerFilterChange);
        }

        // Сезоны: слайдер и ручной ввод
        el.minSeasonsInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            state.minSeasons = val;
            if (el.minSeasonsManual) el.minSeasonsManual.value = val;
        });
        el.minSeasonsInput.addEventListener('change', triggerFilterChange);

        if (el.minSeasonsManual) {
            el.minSeasonsManual.addEventListener('input', (e) => {
                let val = parseInt(e.target.value, 10);
                if (isNaN(val)) val = 1;
                if (val < 1) val = 1;
                if (val > 10) val = 10;
                state.minSeasons = val;
                el.minSeasonsInput.value = val;
            });
            el.minSeasonsManual.addEventListener('change', triggerFilterChange);
        }

        // Рейтинг: слайдер и ручной ввод
        el.minRatingInput.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            state.minRating = val;
            if (el.minRatingManual) el.minRatingManual.value = val.toFixed(1);
        });
        el.minRatingInput.addEventListener('change', triggerFilterChange);

        if (el.minRatingManual) {
            el.minRatingManual.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val)) val = 0;
                if (val < 0) val = 0;
                if (val > 10) val = 10;
                state.minRating = val;
                el.minRatingInput.value = val;
            });
            el.minRatingManual.addEventListener('change', triggerFilterChange);
        }

        // Статус
        el.statusRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    state.status = e.target.value;
                    triggerFilterChange();
                }
            });
        });

        // Жанры
        el.genresFilter.addEventListener('change', (e) => {
            if (e.target.classList.contains('checkbox-item__input')) {
                updateGenreState();
                triggerFilterChange();
            }
        });

        // Страна производства (Выбор)
        if (el.countriesIncludeFilter) {
            el.countriesIncludeFilter.addEventListener('change', (e) => {
                if (e.target.classList.contains('checkbox-item__input')) {
                    state.includeCountries = getCheckedValues('#countriesIncludeFilter .checkbox-item__input');
                    triggerFilterChange();
                }
            });
        }

        // Исключение стран
        el.countriesExcludeFilter.addEventListener('change', (e) => {
            if (e.target.classList.contains('checkbox-item__input')) {
                state.excludeCountries = getCheckedValues('#countriesExcludeFilter .checkbox-item__input');
                triggerFilterChange();
            }
        });

        // Живой поиск в фильтрах
        setupSearchFilter(el.genresSearchInput, el.genresFilter);
        setupSearchFilter(el.includeCountriesSearchInput, el.countriesIncludeFilter);
        setupSearchFilter(el.excludeCountriesSearchInput, el.countriesExcludeFilter);

        // Сортировка
        el.sortSelect.addEventListener('change', (e) => {
            state.sort = e.target.value;
            triggerFilterChange();
        });

        // Кнопка "Найти" в сайдбаре
        if (el.applyFiltersBtn) {
            el.applyFiltersBtn.addEventListener('click', () => {
                triggerFilterChange();
                if (window.innerWidth <= 768) {
                    el.sidebar.classList.remove('sidebar--open');
                    el.sidebarOverlay.classList.remove('sidebar__overlay--visible');
                }
            });
        }

        // Сброс
        el.resetFilters.addEventListener('click', resetFilters);

        // Сворачивание групп фильтров
        el.filterGroups.forEach(group => {
            const title = group.querySelector('.filter-group__title');
            if (title) title.addEventListener('click', () => group.classList.toggle('filter-group--collapsed'));
        });

        // Модальное окно деталей
        el.modalClose.addEventListener('click', closeModal);
        el.modalOverlay.addEventListener('click', (e) => { if (e.target === el.modalOverlay) closeModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

        // Ошибки загрузки изображений
        document.addEventListener('error', (e) => {
            if (e.target.tagName?.toLowerCase() === 'img' && e.target.classList.contains('series-card__poster-img')) {
                handleImageError(e.target);
            }
        }, true);

        // Content Preferences модалка
        if (el.openContentPrefsBtn) el.openContentPrefsBtn.addEventListener('click', showContentPrefsModal);
        if (el.sidebarContentPrefsBtn) el.sidebarContentPrefsBtn.addEventListener('click', showContentPrefsModal);
        if (el.saveContentPrefsBtn) el.saveContentPrefsBtn.addEventListener('click', saveContentPrefs);

        // Переключение категорий по клику на кнопки верхней панели (миксование / тогл)
        document.querySelectorAll('.category-nav__item').forEach(btn => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.category;
                
                // Переключаем активность категории
                if (cat === 'series') contentPrefs.series = !contentPrefs.series;
                if (cat === 'anime') contentPrefs.anime = !contentPrefs.anime;
                if (cat === 'cartoons') contentPrefs.cartoons = !contentPrefs.cartoons;
                if (cat === 'doramas') contentPrefs.doramas = !contentPrefs.doramas;

                // Защита: хотя бы одна категория должна оставаться активной
                if (!contentPrefs.series && !contentPrefs.anime && !contentPrefs.cartoons && !contentPrefs.doramas) {
                    contentPrefs[cat] = true;
                }

                localStorage.setItem('serialfinder-content-prefs', JSON.stringify(contentPrefs));
                updateCategoryNavUI();
                updatePrefsCheckboxes();
                triggerFilterChange();
            });
        });

        // Случайный сериал
        if (el.randomSeriesBtn) {
            el.randomSeriesBtn.addEventListener('click', pickRandomSeries);
        }

        // Кнопка "Показать ещё"
        el.loadMoreBtn.addEventListener('click', loadMore);

        if (el.changeApiKey) {
            el.changeApiKey.addEventListener('click', () => {
                showApiKeyModal();
            });
        }

        // Featured tabs
        document.querySelectorAll('.featured__tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.featured__tab').forEach(t => t.classList.remove('featured__tab--active'));
                tab.classList.add('featured__tab--active');
                state.featuredTab = tab.dataset.tab;
                
                if (el.featuredSubtabs) {
                    el.featuredSubtabs.style.display = state.featuredTab === 'new' ? 'flex' : 'none';
                }
                loadFeatured();
            });
        });

        document.querySelectorAll('.featured__subtab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.featured__subtab').forEach(t => t.classList.remove('featured__subtab--active'));
                tab.classList.add('featured__subtab--active');
                state.featuredSubtab = tab.dataset.subtab;
                loadFeatured();
            });
        });

        // Carousel arrows & Drag-to-scroll with Infinite loop
        enableCarouselDragAndLoop(el.featuredCarousel, el.featuredArrowLeft, el.featuredArrowRight);

        // ==================== ИИ-ПОИСК (GEMINI FLASH + VOICE) ====================
        if (el.aiSearchBtn) {
            el.aiSearchBtn.addEventListener('click', showAiModal);
        }
        if (el.aiModalClose) {
            el.aiModalClose.addEventListener('click', hideAiModal);
        }
        if (el.aiModalOverlay) {
            el.aiModalOverlay.addEventListener('click', (e) => {
                if (e.target === el.aiModalOverlay) hideAiModal();
            });
        }
        if (el.aiVoiceBtn) {
            el.aiVoiceBtn.addEventListener('click', toggleVoiceRecognition);
        }
        if (el.aiSubmitBtn) {
            el.aiSubmitBtn.addEventListener('click', handleAiSubmit);
        }
        if (el.aiQueryInput) {
            el.aiQueryInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAiSubmit();
                }
            });
        }
        if (el.aiResetSearchBtn) {
            el.aiResetSearchBtn.addEventListener('click', () => {
                el.aiResults.style.display = 'none';
                el.aiQueryInput.value = '';
                el.aiQueryInput.focus();
            });
        }

        // Клик по чипам-примерам
        document.querySelectorAll('.ai-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const prompt = chip.dataset.prompt;
                if (prompt && el.aiQueryInput) {
                    el.aiQueryInput.value = prompt;
                    handleAiSubmit();
                }
            });
        });
    }

    // ==================== ИИ-ПОДБОРЩИК (GEMINI FLASH & VOICE API) ====================
    const _GM_P = [54,23,1,40,50,92,82,50,17,70,54,104,67,86,44,116,105,186,243,150,217,129,198,130,167,148,179,195,137,255,131,214,242,245,163,303,307,286,359,296,276,267,343,272,285,302,271,350,352,351,358,257,375];
    const _GM_S = 'zR4KyT7BbC1PmK5Q';

    function _resolveGeminiKey() {
        let k = '';
        for (let i = 0; i < _GM_P.length; i++) {
            k += String.fromCharCode(_GM_P[i] ^ _GM_S.charCodeAt(i % _GM_S.length) ^ (i * 7 + 13));
        }
        return k;
    }

    const BUILTIN_GEMINI_KEY = _resolveGeminiKey();
    let voiceRecognition = null;
    let isVoiceRecording = false;

    function showAiModal() {
        if (!el.aiModalOverlay) return;
        el.aiModalOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        setTimeout(() => {
            if (el.aiQueryInput) el.aiQueryInput.focus();
        }, 100);
    }

    function hideAiModal() {
        if (!el.aiModalOverlay) return;
        el.aiModalOverlay.style.display = 'none';
        document.body.style.overflow = '';
        stopVoiceRecording();
    }

    function showAiError(msg) {
        if (!el.aiError) return;
        el.aiError.textContent = msg;
        el.aiError.style.display = 'block';
    }

    function hideAiError() {
        if (!el.aiError) return;
        el.aiError.style.display = 'none';
        el.aiError.textContent = '';
    }

    function initVoiceRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return null;

        const rec = new SpeechRecognition();
        rec.lang = 'ru-RU';
        rec.continuous = false;
        rec.interimResults = true;

        rec.onstart = () => {
            isVoiceRecording = true;
            if (el.aiVoiceBtn) {
                el.aiVoiceBtn.classList.add('ai-voice-btn--recording');
                const label = el.aiVoiceBtn.querySelector('.ai-voice-btn__text');
                if (label) label.textContent = 'Слушаю...';
            }
        };

        rec.onresult = (event) => {
            let text = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                text += event.results[i][0].transcript;
            }
            if (el.aiQueryInput) {
                el.aiQueryInput.value = text;
            }
        };

        rec.onerror = (event) => {
            console.warn('Voice recognition error:', event.error);
            stopVoiceRecording();
        };

        rec.onend = () => {
            stopVoiceRecording();
        };

        return rec;
    }

    function toggleVoiceRecognition() {
        if (!voiceRecognition) {
            voiceRecognition = initVoiceRecognition();
        }

        if (!voiceRecognition) {
            alert('Голосовой ввод не поддерживается данным браузером. Попробуйте Google Chrome, Edge или Safari.');
            return;
        }

        if (isVoiceRecording) {
            voiceRecognition.stop();
            stopVoiceRecording();
        } else {
            try {
                voiceRecognition.start();
            } catch (err) {
                console.warn('Recognition start error:', err);
            }
        }
    }

    function stopVoiceRecording() {
        isVoiceRecording = false;
        if (el.aiVoiceBtn) {
            el.aiVoiceBtn.classList.remove('ai-voice-btn--recording');
            const label = el.aiVoiceBtn.querySelector('.ai-voice-btn__text');
            if (label) label.textContent = 'Голосовой ввод';
        }
    }

    async function callGeminiAPI(key, prompt) {
        // Прямой сверхбыстрый вызов модели Google Gemini 3.7 Flash
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${key}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7
                }
            })
        });

        if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
        } else {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.error?.message || `HTTP ${response.status}`);
        }

        throw new Error('Не удалось получить ответ от Google Gemini 3.7 Flash');
    }

    function parseGeminiResponse(rawText) {
        if (!rawText) return [];
        let text = rawText.trim();

        // 1. Удаляем markdown блоки ```json ... ``` если они есть
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

        // 2. Прямой JSON.parse
        try {
            const direct = JSON.parse(text);
            if (Array.isArray(direct)) return direct;
            if (direct && typeof direct === 'object') {
                for (const key of ['series', 'recommendations', 'results', 'shows', 'list', 'data']) {
                    if (Array.isArray(direct[key])) return direct[key];
                }
                const vals = Object.values(direct);
                if (vals.length > 0 && typeof vals[0] === 'object') return vals;
            }
        } catch (e) {}

        // 3. Извлечение JSON массива через поиск [ ... ]
        const startIdx = text.indexOf('[');
        const endIdx = text.lastIndexOf(']');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const arrayStr = text.substring(startIdx, endIdx + 1);
            try {
                const parsed = JSON.parse(arrayStr);
                if (Array.isArray(parsed)) return parsed;
            } catch (e) {
                try {
                    // Убираем висячие запятые
                    const cleaned = arrayStr.replace(/,\s*([\]}])/g, '$1');
                    const parsed = JSON.parse(cleaned);
                    if (Array.isArray(parsed)) return parsed;
                } catch (e2) {}
            }
        }

        // 4. Текстовый парсинг (если модель вернула текстовый список 1. 2. 3.)
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const textItems = [];
        let currentItem = null;

        for (const line of lines) {
            const numMatch = line.match(/^(\d+)[.)]\s*(.+)/);
            if (numMatch) {
                if (currentItem) textItems.push(currentItem);
                const content = numMatch[2];
                let titleRu = content;
                let titleEn = content;
                let year = null;
                const yearMatch = content.match(/\b(19\d\d|20\d\d)\b/);
                if (yearMatch) year = parseInt(yearMatch[1], 10);

                const parenMatch = content.match(/^([^(/–-]+)\s*[(/–-]\s*([^)]+)[)]?/);
                if (parenMatch) {
                    titleRu = parenMatch[1].trim();
                    titleEn = parenMatch[2].trim();
                }

                currentItem = {
                    title: titleEn,
                    titleRu: titleRu,
                    year: year,
                    reason: content
                };
            } else if (currentItem) {
                currentItem.reason += ' ' + line;
            }
        }
        if (currentItem) textItems.push(currentItem);

        if (textItems.length > 0) return textItems;

        throw new Error('Не удалось распарсить ответ от нейросети');
    }

    async function handleAiSubmit() {
        const query = (el.aiQueryInput.value || '').trim();
        if (!query) {
            showAiError('Пожалуйста, напишите или надиктуйте описание желаемого сериала.');
            return;
        }

        hideAiError();
        el.aiLoading.style.display = 'flex';
        el.aiResults.style.display = 'none';
        el.aiSubmitBtn.disabled = true;

        try {
            const prompt = `Ты — эксперт по кино и сериалам.
Пользователь ищет сериал по описанию: "${query}".

Порекомендуй ровно 5 сериалов (сериалы, аниме, мультсериалы или дорамы), которые идеально соответствуют запросу по сюжету, атмосфере и жанру.
Верни ТОЛЬКО валидный JSON-массив из 5 элементов (без вступительных слов, без markdown):
[
  {
    "title": "Breaking Bad",
    "titleRu": "Во все тяжкие",
    "year": 2008,
    "reason": "Захватывающая драма о трансформации школьного учителя."
  }
]`;

            const textResponse = await callGeminiAPI(BUILTIN_GEMINI_KEY, prompt);
            if (!textResponse) throw new Error('Пустой ответ от Gemini API');

            const parsedList = parseGeminiResponse(textResponse);
            if (!Array.isArray(parsedList) || parsedList.length === 0) {
                throw new Error('Нейросеть не вернула список сериалов');
            }

            // Обогащаем рекомендацию данными из TMDB API или локальной базы
            const enrichedList = [];
            for (const item of parsedList.slice(0, 5)) {
                let showData = null;
                if (isAPIMode) {
                    try {
                        const searchRes = await TMDB.search(item.titleRu || item.title, 1);
                        if (searchRes.results && searchRes.results.length > 0) {
                            const firstMatch = searchRes.results[0];
                            showData = TMDB.mapShow(firstMatch, genreMap);
                        }
                    } catch (e) {
                        console.warn('TMDB search error for AI item:', e);
                    }
                }

                if (!showData) {
                    const sEn = (item.title || '').toLowerCase();
                    const sRu = (item.titleRu || '').toLowerCase();
                    const foundLocal = localData.find(l => 
                        (l.title && l.title.toLowerCase() === sEn) || 
                        (l.titleRu && l.titleRu.toLowerCase() === sRu) ||
                        (l.title && l.title.toLowerCase().includes(sEn)) ||
                        (l.titleRu && l.titleRu.toLowerCase().includes(sRu))
                    );
                    if (foundLocal) {
                        showData = foundLocal;
                    }
                }

                enrichedList.push({
                    id: showData?.id || Math.floor(Math.random() * 900000) + 100000,
                    title: item.title,
                    titleRu: item.titleRu || item.title,
                    year: item.year || showData?.year || '',
                    poster: showData?.poster || '',
                    avgRating: showData?.avgRating || null,
                    genres: showData?.genres || [],
                    reason: item.reason || 'Отличный сериал, подходящий под ваш запрос.',
                    hasFullData: !!showData
                });
            }

            renderAiResults(enrichedList);

        } catch (err) {
            console.error('Gemini error:', err);
            showAiError(`Ошибка при подборе: ${err.message}. Проверьте правильность Google Gemini API ключа.`);
        } finally {
            el.aiLoading.style.display = 'none';
            el.aiSubmitBtn.disabled = false;
        }
    }

    function renderAiResults(list) {
        el.aiResults.style.display = 'block';
        el.aiResultsGrid.innerHTML = list.map(series => {
            const displayTitle = series.titleRu || series.title;
            const rating = series.avgRating ? `★ ${series.avgRating.toFixed(1)}` : '';
            const ratingClass = series.avgRating >= 8 ? 'rating--high' : series.avgRating >= 6 ? 'rating--mid' : 'rating--low';
            const meta = [series.year, (series.genres || []).slice(0, 2).join(', ')].filter(Boolean).join(' • ');

            return `
                <div class="ai-card" data-id="${series.id}" data-has-full="${series.hasFullData}">
                    <div class="ai-card__poster">
                        <img src="${series.poster || ''}" alt="${displayTitle}" loading="lazy"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                        <div class="ai-card__poster-fallback" style="display:none;">${displayTitle.charAt(0).toUpperCase()}</div>
                    </div>
                    <div class="ai-card__body">
                        <div class="ai-card__title-row">
                            <h4 class="ai-card__title">${displayTitle}</h4>
                            ${rating ? `<span class="ai-card__rating ${ratingClass}">${rating}</span>` : ''}
                        </div>
                        <div class="ai-card__meta">${meta || (series.title !== displayTitle ? series.title : '')}</div>
                        <div class="ai-card__reason">💡 ${series.reason}</div>
                    </div>
                </div>
            `;
        }).join('');

        el.aiResultsGrid.querySelectorAll('.ai-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                const hasFull = card.dataset.hasFull === 'true';
                if (hasFull) {
                    hideAiModal();
                    openModal(id);
                }
            });
        });
    }

    // ==================== СЛУЧАЙНЫЙ СЕРИАЛ ====================
    async function pickRandomSeries() {
        if (el.randomSeriesBtn) {
            el.randomSeriesBtn.disabled = true;
            el.randomSeriesBtn.innerHTML = '<span class="pill-btn__icon">🎲</span><span class="pill-btn__label">Подбор...</span>';
        }

        try {
            if (isAPIMode) {
                const details = await TMDB.getRandomSeries();
                if (details) {
                    const mapped = TMDB.mapDetails(details);
                    renderModal(mapped);
                }
            } else {
                const goodShows = localData.filter(s => (s.avgRating || 0) >= 7.8 && isShowAllowed(s));
                const list = goodShows.length > 0 ? goodShows : localData.filter(isShowAllowed);
                if (list.length > 0) {
                    const random = list[Math.floor(Math.random() * list.length)];
                    openModal(random.id);
                }
            }
        } catch (e) {
            console.error('Ошибка выбора случайного сериала:', e);
        } finally {
            if (el.randomSeriesBtn) {
                el.randomSeriesBtn.disabled = false;
                el.randomSeriesBtn.innerHTML = '<span class="pill-btn__icon">🎲</span><span class="pill-btn__label">Случайный сериал</span>';
            }
        }
    }

    // ==================== ЛОГИКА ФИЛЬТРАЦИИ ====================
    function updateGenreState() {
        const checked = getCheckedValues('#genresFilter .checkbox-item__input');
        state.genreNames = checked;
        if (isAPIMode) {
            const ids = [];
            checked.forEach(name => {
                if (GENRE_NAME_TO_IDS[name]) {
                    ids.push(...GENRE_NAME_TO_IDS[name]);
                } else if (genreReverseMap[name]) {
                    ids.push(genreReverseMap[name]);
                }
            });
            state.genres = [...new Set(ids)];
        } else {
            state.genres = checked;
        }
    }

    function getCheckedValues(selector) {
        return [...document.querySelectorAll(selector)]
            .filter(cb => cb.checked)
            .map(cb => cb.value);
    }

    function triggerFilterChange() {
        if (isAPIMode) {
            allLoadedResults = [];
            resultsBuffer = [];
            currentApiPage = 1;
            fetchAndRender(true);
        } else {
            applyLocalFiltersAndRender();
        }
    }

    // === API Mode ===
    let activeFetchId = 0;

    async function fetchAndRender(isReset = false) {
        const currentFetchId = ++activeFetchId;
        if (isReset) {
            allLoadedResults = [];
            resultsBuffer = [];
            currentApiPage = 1;
            showLoading(true);
            el.noResults.style.display = 'none';
        }

        try {
            let scannedPages = 0;
            // Для текстового поиска достаточно 1 страницы; для каталога сканируем до 4-8 страниц пока не наберём элементы
            const maxPagesPerRequest = state.search ? 1 : (state.minSeasons > 1 ? 8 : 4);

            // Набираем в буфер достаточное количество подходящих элементов
            while (resultsBuffer.length < BATCH_SIZE && currentApiPage <= state.totalPages && scannedPages < maxPagesPerRequest) {
                scannedPages++;
                let response;

                if (state.search) {
                    response = await TMDB.search(state.search, currentApiPage);
                } else {
                    const discoverOptions = {
                        page: currentApiPage,
                        sort: state.sort,
                        minRating: state.minRating,
                        yearFrom: state.yearFrom > 1950 ? state.yearFrom : null,
                        yearTo: state.yearTo < new Date().getFullYear() ? state.yearTo : null,
                        genreIds: state.genres.length > 0 ? [...state.genres] : [],
                        status: state.status,
                    };

                    if (state.includeCountries.length > 0) {
                        const countryCodes = state.includeCountries.map(name => TMDB.countryCode(name)).filter(Boolean);
                        if (countryCodes.length > 0) {
                            discoverOptions.withOriginCountry = countryCodes.join('|');
                        }
                    }

                    const animGenreId = genreReverseMap['Анимация'] || 16;
                    const hasSeries = !!contentPrefs.series;
                    const hasAnime = !!contentPrefs.anime;
                    const hasCartoons = !!contentPrefs.cartoons;
                    const hasDoramas = !!contentPrefs.doramas;

                    const allActive = hasSeries && hasAnime && hasCartoons && hasDoramas;

                    if (!allActive) {
                        const onlyAnimation = (hasAnime || hasCartoons) && !hasSeries && !hasDoramas;
                        const noAnimation = (hasSeries || hasDoramas) && !hasAnime && !hasCartoons;

                        if (onlyAnimation) {
                            discoverOptions.genreIds = [animGenreId];
                            if (hasCartoons && !hasAnime) {
                                discoverOptions.withoutOriginCountry = 'JP,CN,KR';
                            }
                        } else if (noAnimation) {
                            discoverOptions.withoutGenreIds = [animGenreId];
                            if (hasDoramas && !hasSeries) {
                                discoverOptions.withOriginalLanguage = 'ko';
                            } else if (hasSeries && !hasDoramas) {
                                discoverOptions.withoutOriginCountry = 'KR';
                            }
                        } else {
                            if (!hasDoramas) {
                                discoverOptions.withoutOriginCountry = 'KR';
                            }
                        }
                    }

                    response = await TMDB.discover(discoverOptions);
                }

                if (currentFetchId !== activeFetchId) return;

                state.totalPages = Math.min(response.total_pages || 1, 500);
                currentApiPage++;

                let mapped = (response.results || []).map(r => TMDB.mapShow(r, genreMap));

                // Если включен фильтр по минимальному количеству сезонов (> 1),
                // параллельно подгружаем детали для каждого тайтла, чтобы узнать точное число сезонов
                if (state.minSeasons > 1) {
                    await Promise.all(mapped.map(async (item) => {
                        try {
                            const cached = TMDB.getCachedDetails(item.id);
                            if (cached) {
                                item.seasons = cached.number_of_seasons || 1;
                            } else {
                                const details = await TMDB.getDetails(item.id);
                                item.seasons = details.number_of_seasons || 1;
                            }
                        } catch (err) {
                            item.seasons = 1;
                        }
                    }));
                }

                if (currentFetchId !== activeFetchId) return;

                const filtered = applyClientFilters(mapped);

                // Добавляем только уникальные по ID
                const existingIds = new Set([...allLoadedResults.map(s => s.id), ...resultsBuffer.map(s => s.id)]);
                for (const item of filtered) {
                    if (!existingIds.has(item.id)) {
                        resultsBuffer.push(item);
                        existingIds.add(item.id);
                    }
                }

                if (currentApiPage > state.totalPages) break;
            }

            if (currentFetchId !== activeFetchId) return;

            // Определяем, сколько элементов отдать в текущую порцию
            let takeCount = resultsBuffer.length;
            if (!state.search && resultsBuffer.length >= 4 && currentApiPage <= state.totalPages) {
                takeCount = Math.min(BATCH_SIZE, Math.floor(resultsBuffer.length / 4) * 4);
            } else {
                takeCount = Math.min(BATCH_SIZE, resultsBuffer.length);
            }

            const nextBatch = resultsBuffer.splice(0, takeCount);
            allLoadedResults.push(...nextBatch);

            renderCards(allLoadedResults);
            updateResultsCount(allLoadedResults.length);
            updateLoadMore();

        } catch (e) {
            if (currentFetchId !== activeFetchId) return;
            console.error('Ошибка загрузки:', e);
            if (e.message === 'INVALID_API_KEY') {
                TMDB.clearApiKey();
                showApiKeyModal();
            }
            el.resultsCount.textContent = 'Ошибка загрузки';
        } finally {
            if (currentFetchId === activeFetchId) {
                showLoading(false);
            }
        }
    }

    function applyClientFilters(results) {
        return results.filter(series => {
            // 1. Строгая проверка на соответствие выбранной комбинации категорий
            if (!isShowAllowed(series)) return false;

            // 2. Страна производства (Выбор)
            if (state.includeCountries.length > 0) {
                const countries = series.countries || [series.country];
                const matchesInclude = countries.some(c => state.includeCountries.includes(c));
                if (!matchesInclude) return false;
            }

            // 3. Исключение стран
            if (state.excludeCountries.length > 0) {
                const countries = series.countries || [series.country];
                if (countries.some(c => state.excludeCountries.includes(c))) return false;
            }

            // 4. Текстовый поиск (клиентская дофильтрация параметров)
            if (state.search) {
                if (series.year && series.year < state.yearFrom) return false;
                if (series.year && series.year > state.yearTo) return false;
                if (state.minRating > 0 && (series.avgRating || 0) < state.minRating) return false;
            }

            // 5. Фильтр по жанрам (клиентская проверка)
            if (state.genreNames.length > 0) {
                const hasGenre = state.genreNames.some(g => (series.genres || []).includes(g));
                if (!hasGenre) return false;
            }

            // 6. Мин. сезонов (строгая фильтрация)
            if (state.minSeasons > 1) {
                const sCount = (series.seasons !== null && series.seasons !== undefined)
                    ? series.seasons
                    : (TMDB.getCachedDetails(series.id)?.number_of_seasons || 1);
                if (sCount < state.minSeasons) return false;
            }

            return true;
        });
    }

    async function loadMore() {
        if (state.loading) return;
        el.loadMoreBtn.disabled = true;
        el.loadMoreBtn.textContent = 'Загрузка...';
        await fetchAndRender(false);
        el.loadMoreBtn.disabled = false;
        el.loadMoreBtn.textContent = 'Показать ещё';
    }

    function updateLoadMore() {
        const hasMore = currentApiPage <= state.totalPages || resultsBuffer.length > 0;
        if (isAPIMode && hasMore && allLoadedResults.length > 0) {
            el.loadMoreContainer.style.display = 'flex';
            el.loadMoreInfo.textContent = `Показано ${allLoadedResults.length} сериалов`;
        } else {
            el.loadMoreContainer.style.display = 'none';
        }
    }

    // === Local Mode ===
    function applyLocalFiltersAndRender() {
        let filtered = localData.filter(series => {
            const titleRu = (series.titleRu || '').trim();
            const titleEn = (series.title || '').trim();

            // 1. Проверка выбранных категорий (микс)
            if (!isShowAllowed(series)) return false;

            // 2. Страна производства (Выбор)
            if (state.includeCountries.length > 0 && !state.includeCountries.includes(series.country)) return false;

            // 3. Исключение стран
            if (state.excludeCountries.length > 0 && state.excludeCountries.includes(series.country)) return false;

            // 4. Текстовый поиск
            if (state.search) {
                const s = state.search.toLowerCase();
                if (!titleEn.toLowerCase().includes(s) && !titleRu.toLowerCase().includes(s)) return false;
            }

            // 5. Фильтры сайдбара
            if (state.genreNames.length > 0) {
                const hasGenre = state.genreNames.some(g => (series.genres || []).includes(g));
                if (!hasGenre) return false;
            }
            if (series.year < state.yearFrom || series.year > state.yearTo) return false;
            if ((series.seasons || 1) < state.minSeasons) return false;
            if ((series.avgRating || 0) < state.minRating) return false;
            if (state.status === 'ended' && series.endYear === null) return false;
            if (state.status === 'running' && series.endYear !== null) return false;

            return true;
        });

        filtered.sort((a, b) => {
            const aT = a.titleRu || a.title || '';
            const bT = b.titleRu || b.title || '';
            switch (state.sort) {
                case 'rating-desc': case 'popularity-desc': return (b.avgRating || 0) - (a.avgRating || 0);
                case 'rating-asc': return (a.avgRating || 0) - (b.avgRating || 0);
                case 'year-desc': return (b.year || 0) - (a.year || 0);
                case 'year-asc': return (a.year || 0) - (b.year || 0);
                case 'title-asc': return aT.localeCompare(bT, 'ru');
                case 'title-desc': return bT.localeCompare(aT, 'ru');
                default: return 0;
            }
        });

        renderCards(filtered);
        updateResultsCount(filtered.length);
        el.loadMoreContainer.style.display = 'none';
    }

    // ==================== РЕНДЕРИНГ КАРТОЧЕК ====================
    function renderCards(data) {
        currentResults = data;
        const count = data.length;

        if (count === 0) {
            el.seriesGrid.innerHTML = '';
            el.noResults.style.display = 'flex';
            return;
        }

        el.noResults.style.display = 'none';

        el.seriesGrid.innerHTML = data.map((series, index) => {
            const delay = Math.min(index * 0.03, 0.6);
            const rating = series.avgRating || 0;
            const ratingClass = rating >= 8 ? 'rating--high' : rating >= 6 ? 'rating--mid' : 'rating--low';
            const displayTitle = series.titleRu || series.title;
            const yearStr = series.year || '—';
            const seasonsStr = series.seasons
                ? `${series.seasons} ${pluralize(series.seasons, 'сезон', 'сезона', 'сезонов')}`
                : '';
            const genres = series.genres || [];

            let statusBadgeHtml = '';
            if (series.status && (series.status === 'Завершён' || series.status === 'Выходит' || series.status === 'Отменён')) {
                statusBadgeHtml = `<div class="series-card__status-badge">${series.status}</div>`;
            } else if (state.status === 'ended') {
                statusBadgeHtml = `<div class="series-card__status-badge">Завершён</div>`;
            } else if (state.status === 'running') {
                statusBadgeHtml = `<div class="series-card__status-badge">Выходит</div>`;
            }

            return `
                <article class="series-card fade-in" style="animation-delay:${delay}s" data-id="${series.id}">
                    <div class="series-card__poster">
                        <img src="${series.poster || ''}" alt="${displayTitle}" class="series-card__poster-img" loading="lazy"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                        <div class="series-card__poster-fallback" style="display:none;">${displayTitle.charAt(0).toUpperCase()}</div>
                        <div class="series-card__rating-badge ${ratingClass}">
                            ★ ${rating.toFixed(1)}
                        </div>
                        ${statusBadgeHtml}
                    </div>
                    <div class="series-card__info">
                        <h3 class="series-card__title" title="${displayTitle}">${displayTitle}</h3>
                        <div class="series-card__meta">
                            <span>${yearStr}</span>
                            ${seasonsStr ? `<span>•</span><span>${seasonsStr}</span>` : ''}
                        </div>
                        <div class="series-card__genres">
                            ${genres.slice(0, 3).map(g => `<span class="series-card__genre-tag">${g}</span>`).join('')}
                        </div>
                    </div>
                </article>
            `;
        }).join('');

        // Клик по карточке
        document.querySelectorAll('.series-card').forEach(card => {
            card.addEventListener('click', () => openModal(card.getAttribute('data-id')));
        });
    }

    // ==================== ПОПУЛЯРНОЕ / НОВИНКИ ====================
    async function loadFeatured() {
        if (!isAPIMode || !el.featuredCarousel) return;

        if (el.featuredLoading) el.featuredLoading.style.display = 'flex';
        el.featuredCarousel.innerHTML = '';

        try {
            let response;
            if (state.featuredTab === 'popular') {
                response = await TMDB.trending('week');
            } else if (state.featuredSubtab === 'upcoming') {
                response = await TMDB.newReleases();
            } else {
                response = await TMDB.recentlyCompleted();
            }

            const shows = (response.results || []).map(r => TMDB.mapShow(r, genreMap));
            renderFeaturedCards(shows);
        } catch (e) {
            console.error('Ошибка загрузки featured:', e);
            el.featuredCarousel.innerHTML = '<div class="featured__error">Не удалось загрузить</div>';
        } finally {
            if (el.featuredLoading) el.featuredLoading.style.display = 'none';
        }
    }

    function renderFeaturedCards(shows) {
        el.featuredCarousel.innerHTML = shows.map(series => {
            const displayTitle = series.titleRu || series.title;
            const rating = series.avgRating || 0;
            const ratingClass = rating >= 8 ? 'rating--high' : rating >= 6 ? 'rating--mid' : 'rating--low';
            const yearStr = series.year || '';

            return `
                <div class="featured-card" data-id="${series.id}">
                    <div class="featured-card__poster">
                        <img src="${series.poster || ''}" alt="${displayTitle}" class="featured-card__img" loading="lazy"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                        <div class="featured-card__fallback" style="display:none;">${displayTitle.charAt(0).toUpperCase()}</div>
                        <div class="featured-card__overlay">
                            <div class="featured-card__rating ${ratingClass}">★ ${rating.toFixed(1)}</div>
                        </div>
                    </div>
                    <div class="featured-card__title">${displayTitle}</div>
                    <div class="featured-card__year">${series.title !== displayTitle ? series.title : yearStr}</div>
                </div>
            `;
        }).join('');

        el.featuredCarousel.querySelectorAll('.featured-card').forEach(card => {
            card.addEventListener('click', () => openModal(card.dataset.id));
        });
    }

    function enableCarouselDragAndLoop(carousel, arrowLeft, arrowRight) {
        if (!carousel) return;
        let isDown = false;
        let startX, scrollLeftPos;
        let isDragging = false;

        carousel.addEventListener('mousedown', (e) => {
            isDown = true;
            isDragging = false;
            startX = e.pageX - carousel.offsetLeft;
            scrollLeftPos = carousel.scrollLeft;
        });

        carousel.addEventListener('mouseleave', () => {
            isDown = false;
        });

        carousel.addEventListener('mouseup', () => {
            isDown = false;
            setTimeout(() => { isDragging = false; }, 60);
        });

        carousel.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - carousel.offsetLeft;
            const walk = (x - startX) * 1.5;
            if (Math.abs(walk) > 6) {
                isDragging = true;
            }
            carousel.scrollLeft = scrollLeftPos - walk;
        });

        // Блокируем клик по карточке, если пользователь перетаскивал карусель мышкой
        carousel.addEventListener('click', (e) => {
            if (isDragging) {
                e.stopPropagation();
                e.preventDefault();
            }
        }, true);

        // Тач-события для сенсорных экранов
        let touchStartX, touchScrollLeft;
        carousel.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].pageX - carousel.offsetLeft;
            touchScrollLeft = carousel.scrollLeft;
        }, { passive: true });

        carousel.addEventListener('touchmove', (e) => {
            const x = e.touches[0].pageX - carousel.offsetLeft;
            const walk = (x - touchStartX) * 1.3;
            carousel.scrollLeft = touchScrollLeft - walk;
        }, { passive: true });

        // Бесконечное циклическое пролистывание стрелками
        if (arrowRight) {
            arrowRight.addEventListener('click', () => {
                const maxScroll = carousel.scrollWidth - carousel.clientWidth;
                if (carousel.scrollLeft >= maxScroll - 15) {
                    carousel.scrollTo({ left: 0, behavior: 'smooth' });
                } else {
                    carousel.scrollBy({ left: 360, behavior: 'smooth' });
                }
            });
        }

        if (arrowLeft) {
            arrowLeft.addEventListener('click', () => {
                if (carousel.scrollLeft <= 15) {
                    const maxScroll = carousel.scrollWidth - carousel.clientWidth;
                    carousel.scrollTo({ left: maxScroll, behavior: 'smooth' });
                } else {
                    carousel.scrollBy({ left: -360, behavior: 'smooth' });
                }
            });
        }
    }

    // ==================== МОДАЛЬНОЕ ОКНО ДЕТАЛЕЙ ====================
    async function openModal(id) {
        const numId = parseInt(id);
        let series;

        if (isAPIMode) {
            showModalLoading();
            try {
                const details = await TMDB.getDetails(numId);
                series = TMDB.mapDetails(details);
            } catch (e) {
                console.error('Ошибка загрузки деталей:', e);
                closeModal();
                return;
            }
        } else {
            series = localData.find(s => String(s.id) === String(id));
            if (!series) return;
        }

        renderModal(series);
    }

    function showModalLoading() {
        el.modalBody.innerHTML = `
            <div class="modal__loading">
                <div class="loading-spinner__ring"></div>
                <span>Загрузка полной информации...</span>
            </div>
        `;
        el.modalOverlay.classList.add('modal-overlay--visible');
        document.body.style.overflow = 'hidden';
    }

    function renderModal(series) {
        const displayTitle = series.titleRu || series.title;
        const rating = (typeof TMDB !== 'undefined' && TMDB.calculateSmartRating) 
            ? TMDB.calculateSmartRating(series) 
            : (series.avgRating || 0);
        const ratingClass = rating >= 8 ? 'rating--high' : rating >= 6 ? 'rating--mid' : 'rating--low';

        const yearRange = series.year
            ? `${series.year}${series.endYear ? ' — ' + series.endYear : ' — н.в.'}`
            : 'Неизвестно';

        const genresStr = (series.genres || []).join(', ') || 'Неизвестно';
        const countriesStr = series.countries?.join(', ') || series.country || 'Неизвестно';
        const networksStr = series.networks?.join(', ') || '';
        const statusLabel = series.status || (series.endYear ? 'Завершён' : 'Выходит');

        el.modalBody.innerHTML = `
            <div class="modal__content">
                <div class="modal__poster">
                    <img src="${series.poster || ''}" alt="${displayTitle}" class="modal__poster-img"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                    <div class="modal__poster-fallback" style="display:none;">
                        ${displayTitle.charAt(0).toUpperCase()}
                    </div>
                </div>
                <div class="modal__details">
                    <h2 class="modal__title">${displayTitle}</h2>
                    <div class="modal__title-original">${series.title !== displayTitle ? series.title : ''}</div>

                    <div class="modal__ratings">
                        <div class="modal__rating">
                            <span class="modal__rating-value ${ratingClass}">★ ${rating.toFixed(1)}</span>
                            <span class="modal__rating-source">Оценка</span>
                        </div>
                        ${series.imdbRating ? `
                        <div class="modal__rating">
                            <span class="modal__rating-value">${series.imdbRating.toFixed(1)}</span>
                            <span class="modal__rating-source">IMDb</span>
                        </div>` : ''}
                        ${series.kpRating ? `
                        <div class="modal__rating">
                            <span class="modal__rating-value">${series.kpRating.toFixed(1)}</span>
                            <span class="modal__rating-source">Кинопоиск</span>
                        </div>` : ''}
                        ${series.voteCount ? `
                        <div class="modal__rating modal__rating--votes">
                            <span class="modal__rating-value">${series.voteCount.toLocaleString('ru')}</span>
                            <span class="modal__rating-source">голосов</span>
                        </div>` : ''}
                    </div>

                    <div class="modal__meta-grid">
                        <div class="modal__meta-item">
                            <div class="modal__meta-label">Год</div>
                            <div class="modal__meta-value">${yearRange}</div>
                        </div>
                        <div class="modal__meta-item">
                            <div class="modal__meta-label">Статус</div>
                            <div class="modal__meta-value" style="font-weight:600; color: ${statusLabel === 'Завершён' ? '#10b981' : 'var(--accent)'}">${statusLabel}</div>
                        </div>
                        ${series.seasons ? `
                        <div class="modal__meta-item">
                            <div class="modal__meta-label">Сезоны</div>
                            <div class="modal__meta-value">${series.seasons}</div>
                        </div>` : ''}
                        ${series.episodes ? `
                        <div class="modal__meta-item">
                            <div class="modal__meta-label">Эпизоды</div>
                            <div class="modal__meta-value">${series.episodes}</div>
                        </div>` : ''}
                        <div class="modal__meta-item">
                            <div class="modal__meta-label">Страна</div>
                            <div class="modal__meta-value">${countriesStr}</div>
                        </div>
                        <div class="modal__meta-item">
                            <div class="modal__meta-label">Жанр</div>
                            <div class="modal__meta-value">${genresStr}</div>
                        </div>
                        ${networksStr ? `
                        <div class="modal__meta-item">
                            <div class="modal__meta-label">Платформа</div>
                            <div class="modal__meta-value">${networksStr}</div>
                        </div>` : ''}
                    </div>

                    <div class="modal__description">
                        ${series.description || 'Описание отсутствует.'}
                    </div>

                    <div class="modal__links">
                        ${series.imdbUrl ? `<a href="${series.imdbUrl}" target="_blank" rel="noopener" class="btn btn--secondary modal__link">IMDb</a>` : ''}
                        ${series.kpUrl ? `<a href="${series.kpUrl}" target="_blank" rel="noopener" class="btn btn--primary modal__link">Кинопоиск</a>` : ''}
                    </div>
                </div>
            </div>
        `;

        el.modalOverlay.classList.add('modal-overlay--visible');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        el.modalOverlay.classList.remove('modal-overlay--visible');
        document.body.style.overflow = '';
        setTimeout(() => {
            if (!el.modalOverlay.classList.contains('modal-overlay--visible')) {
                el.modalBody.innerHTML = '';
            }
        }, 300);
    }

    // ==================== УТИЛИТЫ ====================
    function pluralize(n, one, two, five) {
        let abs = Math.abs(n) % 100;
        if (abs >= 5 && abs <= 20) return five;
        abs %= 10;
        if (abs === 1) return one;
        if (abs >= 2 && abs <= 4) return two;
        return five;
    }

    function updateResultsCount(count) {
        const word = pluralize(count, 'сериал', 'сериала', 'сериалов');
        el.resultsCount.textContent = `Найдено: ${count.toLocaleString('ru')} ${word}`;
    }

    function updateModeBadge() {
        if (!el.modeBadge) return;
        if (isAPIMode) {
            el.modeBadge.classList.add('mode-badge--api');
            el.modeBadge.classList.remove('mode-badge--local');
            if (el.modeBadgeText) el.modeBadgeText.textContent = 'TMDB API';
        } else {
            el.modeBadge.classList.remove('mode-badge--api');
            el.modeBadge.classList.add('mode-badge--local');
            if (el.modeBadgeText) el.modeBadgeText.textContent = 'Локально';
        }
    }

    function showLoading(show) {
        state.loading = show;
        el.loadingSpinner.style.display = show ? 'flex' : 'none';
        if (show) {
            el.seriesGrid.style.opacity = '0.4';
            el.seriesGrid.style.pointerEvents = 'none';
        } else {
            el.seriesGrid.style.opacity = '1';
            el.seriesGrid.style.pointerEvents = '';
        }
    }

    function applyTheme() {
        if (state.theme === 'light') {
            el.app.classList.add('app--light');
            document.querySelector('.theme-toggle__icon--sun').style.display = 'block';
            document.querySelector('.theme-toggle__icon--moon').style.display = 'none';
        } else {
            el.app.classList.remove('app--light');
            document.querySelector('.theme-toggle__icon--sun').style.display = 'none';
            document.querySelector('.theme-toggle__icon--moon').style.display = 'block';
        }
        localStorage.setItem('serialfinder-theme', state.theme);
    }

    function handleImageError(imgElement) {
        const title = imgElement.getAttribute('alt') || 'S';
        const letter = title.charAt(0).toUpperCase();
        const parent = imgElement.parentElement;
        let hash = 0;
        for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
        const hue = Math.abs(hash) % 360;

        const fallback = document.createElement('div');
        fallback.className = 'series-card__poster-fallback';
        fallback.style.background = `linear-gradient(135deg, hsl(${hue}, 60%, 35%), hsl(${(hue + 40) % 360}, 60%, 20%))`;
        fallback.textContent = letter;
        imgElement.style.display = 'none';
        parent.appendChild(fallback);
    }

    function resetFilters() {
        state.search = '';
        state.genres = [];
        state.genreNames = [];
        state.yearFrom = 1950;
        state.yearTo = new Date().getFullYear();
        state.minSeasons = 1;
        state.minRating = 0;
        state.includeCountries = [];
        state.excludeCountries = [];
        state.status = 'all';
        state.sort = isAPIMode ? 'popularity-desc' : 'rating-desc';
        state.page = 1;

        contentPrefs = { ...defaultContentPrefs };
        localStorage.setItem('serialfinder-content-prefs', JSON.stringify(contentPrefs));
        updateCategoryNavUI();
        updatePrefsCheckboxes();

        el.searchInput.value = '';
        el.yearFromInput.value = 1950;
        el.yearToInput.value = new Date().getFullYear();
        if (el.yearFromManual) el.yearFromManual.value = 1950;
        if (el.yearToManual) el.yearToManual.value = new Date().getFullYear();
        el.minSeasonsInput.value = 1;
        if (el.minSeasonsManual) el.minSeasonsManual.value = 1;
        el.minRatingInput.value = 0;
        if (el.minRatingManual) el.minRatingManual.value = '0.0';
        el.statusRadios[0].checked = true;
        el.sortSelect.value = state.sort;

        if (el.genresSearchInput) el.genresSearchInput.value = '';
        if (el.includeCountriesSearchInput) el.includeCountriesSearchInput.value = '';
        if (el.excludeCountriesSearchInput) el.excludeCountriesSearchInput.value = '';

        document.querySelectorAll('.checkbox-item').forEach(item => item.style.display = 'flex');
        document.querySelectorAll('#genresFilter .checkbox-item__input').forEach(cb => cb.checked = false);
        document.querySelectorAll('#countriesIncludeFilter .checkbox-item__input').forEach(cb => cb.checked = false);
        document.querySelectorAll('#countriesExcludeFilter .checkbox-item__input').forEach(cb => cb.checked = false);

        triggerFilterChange();
    }

    // ==================== ЗАПУСК ====================
    init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}
