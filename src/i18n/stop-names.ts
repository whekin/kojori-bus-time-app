import type { ResolvedLanguage } from '@/i18n/languages';
import type { StopInfo } from '@/services/ttc';

const STOP_NAMES: Record<ResolvedLanguage, Record<string, string>> = {
  en: {
    '1:2994': 'Elene Akhvlediani Street',
    '1:3932': 'Nikoloz Baratashvili Street',
    '1:853': 'Sulkhan-Saba Street',
    '1:4673': 'Mikheil Lermontov Street',
    '1:3078': 'Kojori Center',
    '1:2856': 'Kojori, Vazha-Pshavela St #56',
    '1:4181': 'Kojori Iunkeri St #16',
    '1:3782': 'Kojori, Alexandre Chkheidze Street',
    '1:3537': 'Kojori, Nikoloz Baratashvili Street',
  },
  ka: {
    '1:2994': 'ელენე ახვლედიანის ქუჩა',
    '1:3932': 'ნიკოლოზ ბარათაშვილის ქუჩა',
    '1:853': 'სულხან-საბას ქუჩა',
    '1:4673': 'მიხეილ ლერმონტოვის ქუჩა',
    '1:3078': 'კოჯრის ცენტრი',
    '1:2856': 'კოჯორი, ვაჟა-ფშაველას ქ. #56',
    '1:4181': 'კოჯორი, იუნკერების ქ. #16',
    '1:3782': 'კოჯორი, ალექსანდრე ჩხეიძის ქუჩა',
    '1:3537': 'კოჯორი, ნიკოლოზ ბარათაშვილის ქუჩა',
  },
  ru: {
    '1:2994': 'Улица Елены Ахвледиани',
    '1:3932': 'Улица Николоза Бараташвили',
    '1:853': 'Улица Сулхан-Саба',
    '1:4673': 'Улица Михаила Лермонтова',
    '1:3078': 'Центр Коджори',
    '1:2856': 'Коджори, ул. Важа-Пшавела, 56',
    '1:4181': 'Коджори, ул. Юнкеров, 16',
    '1:3782': 'Коджори, улица Александра Чхеидзе',
    '1:3537': 'Коджори, улица Николоза Бараташвили',
  },
};

const EXACT_LABELS: Record<Exclude<ResolvedLanguage, 'en'>, Record<string, string>> = {
  ka: {
    'Kojori Iunkeri St #16': 'კოჯორი, იუნკერების ქ. #16',
    'Kojori, Iunkeri St #57': 'კოჯორი, იუნკერების ქ. #57',
    'Kojori Zakaria Bakradze Street': 'კოჯორი, ზაქარია ბაქრაძის ქუჩა',
    'Kojori, Sergeants Academy': 'კოჯორი, სერჟანტთა აკადემია',
  },
  ru: {
    'Kojori Iunkeri St #16': 'Коджори, ул. Юнкеров, 16',
    'Kojori, Iunkeri St #57': 'Коджори, ул. Юнкеров, 57',
    'Kojori Zakaria Bakradze Street': 'Коджори, улица Закарии Бакрадзе',
    'Kojori, Sergeants Academy': 'Коджори, Академия сержантов',
  },
};

const PHRASE_REPLACEMENTS: Record<Exclude<ResolvedLanguage, 'en'>, [RegExp, string][]> = {
  ka: [
    [/Nikoloz Baratashvili/g, 'ნიკოლოზ ბარათაშვილის'],
    [/Elene Akhvlediani/g, 'ელენე ახვლედიანის'],
    [/Mikheil Lermontov/g, 'მიხეილ ლერმონტოვის'],
    [/Sulkhan-Saba/g, 'სულხან-საბას'],
    [/Alexandre Chkheidze/g, 'ალექსანდრე ჩხეიძის'],
    [/Vazha-Pshavela/g, 'ვაჟა-ფშაველას'],
    [/Galaktion Tabidze/g, 'გალაკტიონ ტაბიძის'],
    [/Zakaria Bakradze/g, 'ზაქარია ბაქრაძის'],
    [/Ekvtime Takaishvili/g, 'ექვთიმე თაყაიშვილის'],
    [/Dzma Kherkheulidze/g, 'ძმა ხერხეულიძის'],
    [/Iunkeri/g, 'იუნკერების'],
    [/Kojori/g, 'კოჯორი'],
    [/Tbilisi/g, 'თბილისი'],
    [/Kiketi/g, 'კიკეთი'],
    [/Dideba/g, 'დიდება'],
    [/Tabakhmela/g, 'ტაბახმელა'],
    [/Shindisi/g, 'შინდისი'],
    [/Okrokana/g, 'ოქროყანა'],
    [/Center/g, 'ცენტრი'],
    [/Cemetery/g, 'სასაფლაო'],
    [/Highway/g, 'გზატკეცილი'],
    [/Street/g, 'ქუჩა'],
    [/\bSt\b/g, 'ქ.'],
  ],
  ru: [
    [/Nikoloz Baratashvili/g, 'Николоза Бараташвили'],
    [/Elene Akhvlediani/g, 'Елены Ахвледиани'],
    [/Mikheil Lermontov/g, 'Михаила Лермонтова'],
    [/Sulkhan-Saba/g, 'Сулхан-Саба'],
    [/Alexandre Chkheidze/g, 'Александра Чхеидзе'],
    [/Vazha-Pshavela/g, 'Важа-Пшавела'],
    [/Galaktion Tabidze/g, 'Галактиона Табидзе'],
    [/Zakaria Bakradze/g, 'Закарии Бакрадзе'],
    [/Ekvtime Takaishvili/g, 'Эквтиме Такаишвили'],
    [/Dzma Kherkheulidze/g, 'Дзма Херхеулидзе'],
    [/Iunkeri/g, 'Юнкеров'],
    [/Kojori/g, 'Коджори'],
    [/Tbilisi/g, 'Тбилиси'],
    [/Kiketi/g, 'Кикети'],
    [/Dideba/g, 'Дидеба'],
    [/Tabakhmela/g, 'Табахмела'],
    [/Shindisi/g, 'Шиндиси'],
    [/Okrokana/g, 'Окрокана'],
    [/Center/g, 'центр'],
    [/Cemetery/g, 'кладбище'],
    [/Highway/g, 'шоссе'],
    [/Street/g, 'улица'],
    [/\bSt\b/g, 'ул.'],
  ],
};

function localizeFallbackLabel(label: string | undefined, language: ResolvedLanguage) {
  if (!label || language === 'en') return label;

  const exact = EXACT_LABELS[language][label];
  if (exact) return exact;

  let translated = label;
  for (const [pattern, replacement] of PHRASE_REPLACEMENTS[language]) {
    translated = translated.replace(pattern, replacement);
  }

  if (language === 'ru') {
    translated = translated.replace(/ул\. #(\d+)/g, 'ул. $1').replace(/ #(\d+)/g, ', $1');
  }

  return translated === label ? undefined : translated;
}

export function localizedStopName(
  stopOrId: Pick<StopInfo, 'id' | 'label'> | string,
  language: ResolvedLanguage,
  fallback?: string,
) {
  const id = typeof stopOrId === 'string' ? stopOrId : stopOrId.id;
  const base = typeof stopOrId === 'string' ? fallback : stopOrId.label;
  const englishKnown = STOP_NAMES.en[id];
  const localizedFallback = localizeFallbackLabel(base ?? englishKnown, language);

  return STOP_NAMES[language][id] ?? localizedFallback ?? englishKnown ?? base ?? `Stop #${id.split(':')[1] ?? id}`;
}

export function localizedStopNames(language: ResolvedLanguage, source: Record<string, string> = {}) {
  const names: Record<string, string> = {};
  for (const [id, label] of Object.entries(source)) {
    names[id] = localizeFallbackLabel(label, language) ?? label;
  }
  for (const [id, label] of Object.entries(STOP_NAMES[language])) {
    names[id] = label;
  }
  return names;
}
