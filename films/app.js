/**
 * FilmFinder — Поиск и подбор фильмов онлайн
 * Встроенный TMDB Movie API (170 000+ фильмов) + Google Gemini 3.7 Flash AI
 */
function startApp() {
    // ==================== СОСТОЯНИЕ ====================
    const localData = window.FILMS_DATA || [];
    let isAPIMode = true;
    let genreMap = {};        // id → name (для API)
    let genreReverseMap = {}; // name → id (для API)
    let currentResults = [];  // текущие отображаемые результаты
    let allLoadedResults = []; // все загруженные результаты (для пагинации)

    const BATCH_SIZE = 24; // Кратность 4 (десктоп), 3 (планшет), 2 (мобильный)
    let currentApiPage = 1;
    let resultsBuffer = [];

    const state = {
        search: '',
        genres: [],           // названия жанров или id
        genreNames: [],       // всегда названия — для отображения
        yearFrom: 1950,
        yearTo: new Date().getFullYear(),
        minRating: 0,
        includeCountries: [], // выбранные страны производства
        excludeCountries: [], // исключаемые страны
        status: 'all',        // 'all' | 'released' | 'upcoming'
        sort: 'popularity-desc',
        theme: localStorage.getItem('filmfinder-theme') || 'dark',
        page: 1,
        totalPages: 1,
        loading: false,
        featuredTab: 'popular',    // 'popular' | 'new'
        featuredSubtab: 'upcoming', // 'upcoming' | 'released'
    };

    // ==================== ЖАНРЫ ФИЛЬМОВ ====================
    const ALL_GENRES = [
        'Боевик', 'Приключения', 'Научная фантастика', 'Фэнтези', 'Военный',
        'Драма', 'Комедия', 'Криминал', 'Детектив', 'Мистика', 'Триллер', 'Ужасы',
        'Мелодрама', 'Семейный', 'Документальный', 'Анимация', 'Биография',
        'Исторический', 'Вестерн', 'Музыка'
    ];

    const GENRE_NAME_TO_IDS = {
        'Боевик': [28],
        'Приключения': [12],
        'Научная фантастика': [878],
        'Фэнтези': [14],
        'Военный': [10752],
        'Детектив': [9648],
        'Мистика': [9648],
        'Драма': [18],
        'Комедия': [35],
        'Криминал': [80],
        'Триллер': [53],
        'Ужасы': [27],
        'Мелодрама': [10749],
        'Семейный': [10751],
        'Документальный': [99],
        'Анимация': [16],
        'Биография': [36, 18],
        'Исторический': [36],
        'Вестерн': [37],
        'Музыка': [10402]
    };

    // ==================== DOM-ЭЛЕМЕНТЫ ====================
    const el = {
        app: document.getElementById('app'),
        searchInput: document.getElementById('searchInput'),
        themeToggle: document.getElementById('themeToggle'),
        sidebar: document.getElementById('sidebar'),
        sidebarToggle: document.getElementById('sidebarToggle'),
        sidebarOverlay: document.getElementById('sidebarOverlay'),
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
        modeBadge: document.getElementById('modeBadge'),
        modeBadgeText: document.getElementById('modeBadgeText'),
        loadingSpinner: document.getElementById('loadingSpinner'),
        loadMoreContainer: document.getElementById('loadMoreContainer'),
        loadMoreBtn: document.getElementById('loadMoreBtn'),
        loadMoreInfo: document.getElementById('loadMoreInfo'),
        // Featured section
        featuredSection: document.getElementById('featuredSection'),
        featuredCarousel: document.getElementById('featuredCarousel'),
        featuredArrowLeft: document.getElementById('featuredArrowLeft'),
        featuredArrowRight: document.getElementById('featuredArrowRight'),
        featuredLoading: document.getElementById('featuredLoading'),
        featuredSubtabs: document.getElementById('featuredSubtabs'),
        // Random
        randomSeriesBtn: document.getElementById('randomSeriesBtn'),
        // AI Request Elements
        aiSearchBtn: document.getElementById('aiSearchBtn'),
        aiModalOverlay: document.getElementById('aiModalOverlay'),
        aiModalClose: document.getElementById('aiModalClose'),
        aiQueryInput: document.getElementById('aiQueryInput'),
        aiVoiceBtn: document.getElementById('aiVoiceBtn'),
        aiSubmitBtn: document.getElementById('aiSubmitBtn'),
        aiLoading: document.getElementById('aiLoading'),
        aiError: document.getElementById('aiError'),
        aiResults: document.getElementById('aiResults'),
        aiResultsGrid: document.getElementById('aiResultsGrid'),
        aiResetSearchBtn: document.getElementById('aiResetSearchBtn'),
    };

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    async function init() {
        applyTheme();
        setupEventListeners();

        const sortedCountries = Object.keys(TMDB.COUNTRY_CODES).sort((a, b) => a.localeCompare(b, 'ru'));
        await initAPIMode(sortedCountries);
    }

    async function initAPIMode(sortedCountries) {
        isAPIMode = true;
        showLoading(true);
        try {
            const genres = await TMDB.getGenres();
            genreMap = {};
            genreReverseMap = {};
            genres.forEach(g => {
                genreMap[g.id] = g.name;
                genreReverseMap[g.name] = g.id;
            });
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
        setupGenreFilters(ALL_GENRES);
        setupCountryFilters(sortedCountries);

        if (el.featuredSection) el.featuredSection.style.display = 'none';
        state.sort = 'rating-desc';
        el.sortSelect.value = 'rating-desc';

        applyLocalFiltersAndRender();
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
            el.countriesIncludeFilter.innerHTML = createCheckboxes('includeCountries');
        }
        if (el.countriesExcludeFilter) {
            el.countriesExcludeFilter.innerHTML = createCheckboxes('excludeCountries');
        }
    }

    function setupSearchFilter(searchInput, container) {
        if (!searchInput || !container) return;
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const items = container.querySelectorAll('.checkbox-item');
            items.forEach(item => {
                const label = item.querySelector('.checkbox-item__label').textContent.toLowerCase();
                item.style.display = label.includes(query) ? 'flex' : 'none';
            });
        });
    }

    // ==================== СЛУШАТЕЛИ СОБЫТИЙ ====================
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
            }, 300);
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

        // Статус фильма
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

        // Случайный фильм
        if (el.randomSeriesBtn) {
            el.randomSeriesBtn.addEventListener('click', pickRandomMovie);
        }

        // Кнопка "Показать ещё"
        el.loadMoreBtn.addEventListener('click', loadMore);

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

        // ==================== ИИ-ПОИСК (GEMINI 3.7 FLASH + VOICE) ====================
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
                if (el.aiQueryInput) {
                    el.aiQueryInput.value = prompt;
                    handleAiSubmit();
                }
            });
        });
    }

    // ==================== ИИ ПОИСК ФИЛЬМОВ (GEMINI 3.7 FLASH) ====================
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
    let recognition = null;
    let isRecording = false;

    function showAiModal() {
        if (el.aiModalOverlay) {
            el.aiModalOverlay.style.display = 'flex';
            setTimeout(() => {
                if (el.aiQueryInput) el.aiQueryInput.focus();
            }, 100);
        }
    }

    function hideAiModal() {
        if (el.aiModalOverlay) el.aiModalOverlay.style.display = 'none';
        if (isRecording && recognition) {
            recognition.stop();
            isRecording = false;
        }
    }

    function toggleVoiceRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Ваш браузер не поддерживает голосовой ввод. Пожалуйста, используйте Google Chrome, Edge или Safari.');
            return;
        }

        if (isRecording) {
            if (recognition) recognition.stop();
            setVoiceRecordingState(false);
            return;
        }

        try {
            recognition = new SpeechRecognition();
            recognition.lang = 'ru-RU';
            recognition.continuous = false;
            recognition.interimResults = true;

            recognition.onstart = () => {
                setVoiceRecordingState(true);
            };

            recognition.onresult = (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                if (el.aiQueryInput) {
                    el.aiQueryInput.value = transcript;
                }
            };

            recognition.onerror = (event) => {
                console.error('Ошибка распознавания речи:', event.error);
                setVoiceRecordingState(false);
            };

            recognition.onend = () => {
                setVoiceRecordingState(false);
                if (el.aiQueryInput && el.aiQueryInput.value.trim().length > 3) {
                    handleAiSubmit();
                }
            };

            recognition.start();
        } catch (e) {
            console.error('Не удалось запустить распознавание речи:', e);
            setVoiceRecordingState(false);
        }
    }

    function setVoiceRecordingState(recording) {
        isRecording = recording;
        if (!el.aiVoiceBtn) return;
        const voiceText = document.getElementById('aiVoiceText');
        if (recording) {
            el.aiVoiceBtn.classList.add('ai-voice-btn--recording');
            if (voiceText) voiceText.textContent = 'Слушаю...';
        } else {
            el.aiVoiceBtn.classList.remove('ai-voice-btn--recording');
            if (voiceText) voiceText.textContent = 'Голос';
        }
    }

    async function handleAiSubmit() {
        const query = (el.aiQueryInput?.value || '').trim();
        if (!query) {
            if (el.aiQueryInput) el.aiQueryInput.focus();
            return;
        }

        if (el.aiLoading) el.aiLoading.style.display = 'flex';
        if (el.aiError) el.aiError.style.display = 'none';
        if (el.aiResults) el.aiResults.style.display = 'none';
        if (el.aiSubmitBtn) el.aiSubmitBtn.disabled = true;

        try {
            const prompt = `Ты — ведущий мировой эксперт по кино и кинематографу. Пользователь ищет фильм по следующему описанию/пожеланию:
"${query}"

Пожалуйста, подбери ровно 5 самых лучших, подходящих и интересных художественных кинофильмов (movies), идеально отвечающих запросу.
Верни ответ ИСКЛЮЧИТЕЛЬНО в виде валидного JSON-массива из 5 объектов без какого-либо вступительного или заключительного текста, без Markdown-обёрток, ровно в таком формате:
[
  {
    "title": "Оригинальное английское название (например, Inception)",
    "titleRu": "Русское название (например, Начало)",
    "year": 2010,
    "reason": "Ёмкое (1-2 предложения) объяснение на русском языке, почему именно этот фильм идеально подходит под запрос пользователя."
  }
]`;

            const rawText = await callGeminiAPI(BUILTIN_GEMINI_KEY, prompt);
            const recommendations = parseGeminiResponse(rawText);

            if (!recommendations || recommendations.length === 0) {
                throw new Error('ИИ вернул пустой список рекомендаций. Попробуйте уточнить запрос.');
            }

            await renderAiResults(recommendations);
        } catch (e) {
            console.error('Ошибка ИИ-запроса:', e);
            if (el.aiError) {
                el.aiError.textContent = e.message || 'Произошла ошибка при обращении к ИИ.';
                el.aiError.style.display = 'block';
            }
        } finally {
            if (el.aiLoading) el.aiLoading.style.display = 'none';
            if (el.aiSubmitBtn) el.aiSubmitBtn.disabled = false;
        }
    }

    async function callGeminiAPI(key, prompt) {
        const GEMINI_MODELS = [
            'gemini-flash-lite-latest',
            'gemini-3.5-flash-lite',
            'gemini-3.5-flash',
            'gemini-3.6-flash',
            'gemini-3.7-flash'
        ];

        let lastError = null;

        for (const model of GEMINI_MODELS) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.4,
                            maxOutputTokens: 1200
                        }
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) return text;
                } else {
                    const errData = await res.json().catch(() => ({}));
                    console.warn(`Модель ${model} вернула ${res.status}:`, errData?.error?.message);
                    lastError = new Error(errData?.error?.message || `Ошибка API (${res.status})`);
                }
            } catch (e) {
                console.warn(`Ошибка запроса к ${model}:`, e.message);
                lastError = e;
            }
        }

        throw lastError || new Error('Все модели ИИ временно недоступны. Попробуйте снова через минуту.');
    }

    function parseGeminiResponse(rawText) {
        let clean = rawText.trim();
        clean = clean.replace(/```json/gi, '').replace(/```/g, '').trim();

        try {
            const parsed = JSON.parse(clean);
            if (Array.isArray(parsed)) return parsed;
            if (parsed.recommendations && Array.isArray(parsed.recommendations)) return parsed.recommendations;
            if (parsed.movies && Array.isArray(parsed.movies)) return parsed.movies;
        } catch (e) {
            console.warn('JSON.parse failed, fallback parsing...');
        }

        const items = [];
        const lines = clean.split('\n');
        for (const line of lines) {
            const match = line.match(/(?:^\d+[\.\)]\s*|[-*]\s*)(.+?)(?:\s*\((\d{4})\))?\s*[-—–:]\s*(.+)/);
            if (match) {
                const titleStr = match[1].trim();
                const year = match[2] ? parseInt(match[2], 10) : new Date().getFullYear();
                const reason = match[3].trim();
                items.push({
                    title: titleStr,
                    titleRu: titleStr,
                    year: year,
                    reason: reason
                });
            }
        }
        return items.slice(0, 5);
    }

    async function renderAiResults(recommendations) {
        if (!el.aiResultsGrid || !el.aiResults) return;

        const enrichedShows = await Promise.all(recommendations.map(async (rec) => {
            try {
                const query = rec.titleRu || rec.title;
                const tmdbRes = await TMDB.search(query, 1);
                if (tmdbRes.results && tmdbRes.results.length > 0) {
                    const topMatch = tmdbRes.results[0];
                    const mapped = TMDB.mapMovie(topMatch, genreMap);
                    return {
                        ...mapped,
                        aiReason: rec.reason,
                        displayTitle: mapped.titleRu || rec.titleRu || rec.title
                    };
                }
            } catch (err) {
                console.warn('Не удалось обогатить фильм через TMDB:', rec.title, err);
            }

            return {
                id: null,
                title: rec.title,
                titleRu: rec.titleRu,
                displayTitle: rec.titleRu || rec.title,
                year: rec.year,
                avgRating: 8.0,
                poster: null,
                genres: ['Фильм'],
                aiReason: rec.reason,
                description: rec.reason
            };
        }));

        el.aiResultsGrid.innerHTML = enrichedShows.map((movie, idx) => {
            const rating = movie.avgRating || 0;
            const ratingClass = rating >= 8 ? 'rating--high' : rating >= 6 ? 'rating--mid' : 'rating--low';
            const posterHtml = movie.poster ? 
                `<img src="${movie.poster}" alt="${movie.displayTitle}" class="ai-card__img" loading="lazy">` :
                `<div class="ai-card__fallback">${movie.displayTitle.charAt(0).toUpperCase()}</div>`;

            return `
                <div class="ai-card" data-movie-id="${movie.id || ''}" style="animation-delay: ${idx * 0.08}s">
                    <div class="ai-card__poster">
                        ${posterHtml}
                        <div class="ai-card__rating ${ratingClass}">★ ${rating.toFixed(1)}</div>
                    </div>
                    <div class="ai-card__info">
                        <div class="ai-card__title">${movie.displayTitle}</div>
                        <div class="ai-card__meta">${movie.year || ''} • ${movie.genres.slice(0, 2).join(', ')}</div>
                        <div class="ai-card__reason">
                            <span class="ai-card__reason-icon">💡</span>
                            <span>${movie.aiReason}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        el.aiResultsGrid.querySelectorAll('.ai-card').forEach(card => {
            card.addEventListener('click', () => {
                const movieId = card.getAttribute('data-movie-id');
                if (movieId) {
                    hideAiModal();
                    openModal(movieId);
                }
            });
        });

        el.aiResults.style.display = 'block';
    }

    // ==================== СЛУЧАЙНЫЙ ФИЛЬМ ====================
    async function pickRandomMovie() {
        if (!el.randomSeriesBtn) return;
        el.randomSeriesBtn.disabled = true;
        el.randomSeriesBtn.innerHTML = '<span class="pill-btn__icon">⏳</span><span class="pill-btn__label">Подбираем...</span>';

        try {
            if (isAPIMode) {
                const movie = await TMDB.getRandomMovie();
                if (movie) {
                    openModal(movie.id);
                } else if (allLoadedResults.length > 0) {
                    const rand = allLoadedResults[Math.floor(Math.random() * allLoadedResults.length)];
                    openModal(rand.id);
                }
            } else if (localData.length > 0) {
                const rand = localData[Math.floor(Math.random() * localData.length)];
                openModal(rand.id);
            }
        } catch (e) {
            console.error('Ошибка выбора случайного фильма:', e);
        } finally {
            if (el.randomSeriesBtn) {
                el.randomSeriesBtn.disabled = false;
                el.randomSeriesBtn.innerHTML = '<span class="pill-btn__icon">🎲</span><span class="pill-btn__label">Случайный фильм</span>';
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
    let fetchController = null;

    async function fetchAndRender(isReset = false) {
        if (isReset) {
            if (fetchController) fetchController.abort();
            fetchController = new AbortController();
            allLoadedResults = [];
            resultsBuffer = [];
            currentApiPage = 1;
            showLoading(true);
            el.noResults.style.display = 'none';
        }

        try {
            let scannedPages = 0;
            const maxPagesPerRequest = state.search ? 1 : 2;

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

                    response = await TMDB.discover(discoverOptions);
                }

                state.totalPages = Math.min(response.total_pages || 1, 500);
                currentApiPage++;

                let mapped = (response.results || []).map(r => TMDB.mapMovie(r, genreMap));
                const filtered = applyClientFilters(mapped);

                const existingIds = new Set([...allLoadedResults.map(s => s.id), ...resultsBuffer.map(s => s.id)]);
                for (const item of filtered) {
                    if (!existingIds.has(item.id)) {
                        resultsBuffer.push(item);
                        existingIds.add(item.id);
                    }
                }

                if (currentApiPage > state.totalPages) break;
            }

            let takeCount = BATCH_SIZE;
            if (state.search || currentApiPage > state.totalPages) {
                takeCount = resultsBuffer.length;
            } else {
                takeCount = Math.min(BATCH_SIZE, resultsBuffer.length);
                if (takeCount >= 4) {
                    takeCount = Math.floor(takeCount / 4) * 4;
                }
            }

            const nextBatch = resultsBuffer.splice(0, takeCount);
            allLoadedResults.push(...nextBatch);

            renderCards(allLoadedResults);
            updateResultsCount(allLoadedResults.length);
            updateLoadMore();

        } catch (e) {
            if (e.name === 'AbortError') return;
            console.error('Ошибка загрузки фильмов:', e);
            el.resultsCount.textContent = 'Ошибка загрузки';
        } finally {
            showLoading(false);
        }
    }

    function applyClientFilters(results) {
        return results.filter(movie => {
            // 1. Страна производства (Выбор)
            if (state.includeCountries.length > 0) {
                const countries = movie.countries || [movie.country];
                const matchesInclude = countries.some(c => state.includeCountries.includes(c));
                if (!matchesInclude) return false;
            }

            // 2. Исключение стран
            if (state.excludeCountries.length > 0) {
                const countries = movie.countries || [movie.country];
                if (countries.some(c => state.excludeCountries.includes(c))) return false;
            }

            // 3. Жанры
            if (state.genreNames.length > 0) {
                const hasGenre = state.genreNames.some(g => (movie.genres || []).includes(g));
                if (!hasGenre) return false;
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
            el.loadMoreInfo.textContent = `Показано ${allLoadedResults.length} фильмов`;
        } else {
            el.loadMoreContainer.style.display = 'none';
        }
    }

    // === Local Mode ===
    function applyLocalFiltersAndRender() {
        let filtered = localData.filter(movie => {
            const titleRu = (movie.titleRu || '').trim();
            const titleEn = (movie.title || '').trim();

            if (state.includeCountries.length > 0 && !state.includeCountries.includes(movie.country)) return false;
            if (state.excludeCountries.length > 0 && state.excludeCountries.includes(movie.country)) return false;

            if (state.search) {
                const s = state.search.toLowerCase();
                if (!titleEn.toLowerCase().includes(s) && !titleRu.toLowerCase().includes(s)) return false;
            }

            if (state.genreNames.length > 0) {
                const hasGenre = state.genreNames.some(g => (movie.genres || []).includes(g));
                if (!hasGenre) return false;
            }

            if (movie.year < state.yearFrom || movie.year > state.yearTo) return false;
            if ((movie.avgRating || 0) < state.minRating) return false;

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
    function renderCards(movies) {
        currentResults = movies;

        if (movies.length === 0) {
            el.seriesGrid.innerHTML = '';
            el.noResults.style.display = 'block';
            return;
        }

        el.noResults.style.display = 'none';
        el.seriesGrid.innerHTML = movies.map((movie, index) => {
            const rating = movie.avgRating || 0;
            const ratingClass = rating >= 8 ? 'rating--high' : rating >= 6 ? 'rating--mid' : 'rating--low';
            const displayTitle = movie.titleRu || movie.title;
            const yearStr = movie.year || '';
            const durationStr = movie.runtime ? ` • ${movie.runtime}` : '';
            const genreTags = (movie.genres || []).slice(0, 3).map(g => `<span class="series-card__genre-tag">${g}</span>`).join('');

            return `
                <article class="series-card fade-in" data-id="${movie.id}" style="animation-delay: ${Math.min(index * 0.03, 0.5)}s">
                    <div class="series-card__poster">
                        <img class="series-card__poster-img" src="${movie.poster || ''}" alt="${displayTitle}" loading="lazy"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                        <div class="series-card__poster-fallback" style="display:none;">${displayTitle.charAt(0).toUpperCase()}</div>
                        <div class="series-card__rating-badge ${ratingClass}">★ ${rating.toFixed(1)}</div>
                    </div>
                    <div class="series-card__info">
                        <h3 class="series-card__title" title="${displayTitle}">${displayTitle}</h3>
                        <div class="series-card__meta">
                            <span>${yearStr}${durationStr}</span>
                            <span>•</span>
                            <span>${movie.country || 'Фильм'}</span>
                        </div>
                        <div class="series-card__genres">
                            ${genreTags}
                        </div>
                    </div>
                </article>
            `;
        }).join('');

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
            } else if (state.featuredTab === 'streaming') {
                response = await TMDB.digitalReleases();
            } else if (state.featuredSubtab === 'upcoming') {
                response = await TMDB.newReleases();
            } else {
                response = await TMDB.upcoming();
            }

            const movies = (response.results || []).map(r => TMDB.mapMovie(r, genreMap));
            renderFeaturedCards(movies);
        } catch (e) {
            console.error('Ошибка загрузки featured:', e);
            el.featuredCarousel.innerHTML = '<div class="featured__error">Не удалось загрузить</div>';
        } finally {
            if (el.featuredLoading) el.featuredLoading.style.display = 'none';
        }
    }

    function renderFeaturedCards(movies) {
        el.featuredCarousel.innerHTML = movies.map(movie => {
            const displayTitle = movie.titleRu || movie.title;
            const rating = movie.avgRating || 0;
            const ratingClass = rating >= 8 ? 'rating--high' : rating >= 6 ? 'rating--mid' : 'rating--low';
            const yearStr = movie.year || '';

            return `
                <div class="featured-card" data-id="${movie.id}">
                    <div class="featured-card__poster">
                        <img src="${movie.poster || ''}" alt="${displayTitle}" class="featured-card__img" loading="lazy"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                        <div class="featured-card__fallback" style="display:none;">${displayTitle.charAt(0).toUpperCase()}</div>
                        <div class="featured-card__overlay">
                            <div class="featured-card__rating ${ratingClass}">★ ${rating.toFixed(1)}</div>
                        </div>
                    </div>
                    <div class="featured-card__title">${displayTitle}</div>
                    <div class="featured-card__year">${movie.title !== displayTitle ? movie.title : yearStr}</div>
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
        const numId = parseInt(id, 10);
        let movie;

        if (isAPIMode) {
            showModalLoading();
            try {
                const details = await TMDB.getDetails(numId);
                movie = TMDB.mapDetails(details);
            } catch (e) {
                console.error('Ошибка загрузки деталей фильма:', e);
                closeModal();
                return;
            }
        } else {
            movie = localData.find(s => s.id === numId);
        }

        if (!movie) return;

        const displayTitle = movie.titleRu || movie.title;
        const origTitle = movie.title && movie.title !== movie.titleRu ? movie.title : '';
        const rating = (typeof TMDB !== 'undefined' && TMDB.calculateSmartRating) 
            ? TMDB.calculateSmartRating(movie) 
            : (movie.avgRating || 0);
        const ratingClass = rating >= 8 ? 'rating--high' : rating >= 6 ? 'rating--mid' : 'rating--low';
        const genresStr = (movie.genres || []).join(', ');

        el.modalBody.innerHTML = `
            <div class="modal__poster">
                <img class="modal__poster-img" src="${movie.poster || ''}" alt="${displayTitle}"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                <div class="modal__poster-fallback" style="display:none;">${displayTitle.charAt(0).toUpperCase()}</div>
            </div>
            <div class="modal__content">
                <h2 class="modal__title">${displayTitle}</h2>
                ${origTitle ? `<div class="modal__title-original">${origTitle}</div>` : ''}
                ${movie.tagline ? `<div class="modal__tagline">«${movie.tagline}»</div>` : ''}

                <div class="modal__ratings">
                    <div class="modal__rating">
                        <span class="modal__rating-value ${ratingClass}">★ ${rating.toFixed(1)}</span>
                        <span class="modal__rating-source">Средняя оценка</span>
                    </div>
                    ${movie.imdbRating ? `
                    <div class="modal__rating">
                        <span class="modal__rating-value">${movie.imdbRating.toFixed(1)}</span>
                        <span class="modal__rating-source">IMDb</span>
                    </div>` : ''}
                    ${movie.kpRating ? `
                    <div class="modal__rating">
                        <span class="modal__rating-value">${movie.kpRating.toFixed(1)}</span>
                        <span class="modal__rating-source">Кинопоиск</span>
                    </div>` : ''}
                    ${movie.voteCount ? `
                    <div class="modal__rating modal__rating--votes">
                        <span class="modal__rating-value">${movie.voteCount.toLocaleString('ru')}</span>
                        <span class="modal__rating-source">голосов</span>
                    </div>` : ''}
                </div>

                <div class="modal__meta-grid">
                    <div class="modal__meta-item">
                        <span class="modal__meta-label">Год выпуска:</span>
                        <span class="modal__meta-value">${movie.year || 'Не указан'}</span>
                    </div>
                    ${movie.runtime ? `
                    <div class="modal__meta-item">
                        <span class="modal__meta-label">Длительность:</span>
                        <span class="modal__meta-value">${movie.runtime}</span>
                    </div>
                    ` : ''}
                    <div class="modal__meta-item">
                        <span class="modal__meta-label">Страна:</span>
                        <span class="modal__meta-value">${movie.country || 'Не указана'}</span>
                    </div>
                    <div class="modal__meta-item">
                        <span class="modal__meta-label">Жанры:</span>
                        <span class="modal__meta-value">${genresStr}</span>
                    </div>
                    ${movie.director ? `
                    <div class="modal__meta-item">
                        <span class="modal__meta-label">Режиссёр:</span>
                        <span class="modal__meta-value">${movie.director}</span>
                    </div>
                    ` : ''}
                    ${movie.cast ? `
                    <div class="modal__meta-item">
                        <span class="modal__meta-label">В главных ролях:</span>
                        <span class="modal__meta-value">${movie.cast}</span>
                    </div>
                    ` : ''}
                    ${movie.budget ? `
                    <div class="modal__meta-item">
                        <span class="modal__meta-label">Бюджет:</span>
                        <span class="modal__meta-value">${movie.budget}</span>
                    </div>
                    ` : ''}
                </div>

                <p class="modal__description">${movie.description || 'Описание отсутствует.'}</p>

                <div class="modal__links">
                    ${movie.imdbUrl ? `<a href="${movie.imdbUrl}" target="_blank" rel="noopener noreferrer" class="modal__link modal__link--imdb">IMDb ↗</a>` : ''}
                    <a href="${movie.kpUrl}" target="_blank" rel="noopener noreferrer" class="modal__link modal__link--kp">Кинопоиск ↗</a>
                </div>
            </div>
        `;

        el.modalOverlay.classList.add('modal-overlay--visible');
        document.body.style.overflow = 'hidden';
    }

    function showModalLoading() {
        el.modalBody.innerHTML = `
            <div class="modal__loading">
                <div class="loading__spinner"></div>
                <span>Загрузка информации о фильме...</span>
            </div>
        `;
        el.modalOverlay.classList.add('modal-overlay--visible');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        el.modalOverlay.classList.remove('modal-overlay--visible');
        document.body.style.overflow = '';
    }

    function showLoading(show) {
        state.loading = show;
        if (el.loadingSpinner) el.loadingSpinner.style.display = show ? 'flex' : 'none';
    }

    function updateResultsCount(count) {
        if (!el.resultsCount) return;
        const word = pluralize(count, 'фильм', 'фильма', 'фильмов');
        el.resultsCount.textContent = `Найдено: ${count} ${word}`;
    }

    function pluralize(n, one, two, five) {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod100 >= 11 && mod100 <= 19) return five;
        if (mod10 === 1) return one;
        if (mod10 >= 2 && mod10 <= 4) return two;
        return five;
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
        localStorage.setItem('filmfinder-theme', state.theme);
    }

    function resetFilters() {
        state.search = '';
        state.genres = [];
        state.genreNames = [];
        state.yearFrom = 1950;
        state.yearTo = new Date().getFullYear();
        state.minRating = 0;
        state.includeCountries = [];
        state.excludeCountries = [];
        state.status = 'all';
        state.sort = 'popularity-desc';
        state.page = 1;

        el.searchInput.value = '';
        el.yearFromInput.value = 1950;
        el.yearToInput.value = new Date().getFullYear();
        if (el.yearFromManual) el.yearFromManual.value = 1950;
        if (el.yearToManual) el.yearToManual.value = new Date().getFullYear();
        el.minRatingInput.value = 0;
        if (el.minRatingManual) el.minRatingManual.value = '0.0';
        el.statusRadios[0].checked = true;
        el.sortSelect.value = state.sort;

        if (el.genresSearchInput) el.genresSearchInput.value = '';
        if (el.includeCountriesSearchInput) el.includeCountriesSearchInput.value = '';
        if (el.excludeCountriesSearchInput) el.excludeCountriesSearchInput.value = '';

        document.querySelectorAll('.checkbox-item').forEach(item => item.style.display = 'flex');
        document.querySelectorAll('#genresFilter .checkbox-item__input').forEach(cb => cb.checked = false);
        if (el.countriesIncludeFilter) document.querySelectorAll('#countriesIncludeFilter .checkbox-item__input').forEach(cb => cb.checked = false);
        if (el.countriesExcludeFilter) document.querySelectorAll('#countriesExcludeFilter .checkbox-item__input').forEach(cb => cb.checked = false);

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
