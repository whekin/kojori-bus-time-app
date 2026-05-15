import type { ResolvedLanguage } from '@/i18n/languages';

export type StopDirection = 'toKojori' | 'toTbilisi';

type LocalizedStopCopy = Record<ResolvedLanguage, string>;

export type StopCuration = {
  badge: LocalizedStopCopy;
  hint: LocalizedStopCopy;
};

export const CURATED_STOP_IDS: Record<StopDirection, string[]> = {
  toKojori: ['1:2994', '1:3932', '1:853', '1:857'],
  toTbilisi: ['1:3078', '1:4186', '1:2856', '1:2139', '1:3782', '1:3537'],
};

const CURATED_STOP_COPY: Record<StopDirection, Record<string, StopCuration>> = {
  toKojori: {
    '1:2994': {
      badge: { en: 'First stop', ka: 'პირველი', ru: 'Первая' },
      hint: {
        en: 'Bridge-side start where the bus can wait. Sometimes buses go straight to Baratashvili.',
        ka: 'ხიდთან საწყისი გაჩერება, სადაც ავტობუსი შეიძლება დაელოდოს. ზოგჯერ ავტობუსი პირდაპირ ბარათაშვილზე მიდის.',
        ru: 'Старт у моста, где автобус может подождать. Иногда автобус сразу едет на Бараташвили.',
      },
    },
    '1:3932': {
      badge: { en: 'Official start', ka: 'ოფიციალური', ru: 'Официальная' },
      hint: {
        en: 'By the flower market, last stop in the row toward Liberty Square.',
        ka: 'ყვავილების ბაზართან, თავისუფლების მოედნისკენ რიგში ბოლო გაჩერება.',
        ru: 'У цветочного рынка, последняя остановка в ряду к площади Свободы.',
      },
    },
    '1:853': {
      badge: { en: 'Metro', ka: 'მეტრო', ru: 'Метро' },
      hint: {
        en: 'Closest stop to Liberty Square metro.',
        ka: 'თავისუფლების მოედნის მეტროსთან ყველაზე ახლოს.',
        ru: 'Ближайшая остановка к метро Площадь Свободы.',
      },
    },
    '1:857': {
      badge: { en: 'Backup start', ka: 'სათადარიგო', ru: 'Запасная' },
      hint: {
        en: 'Gergeti backup start. When Liberty Square is overloaded, buses may begin here.',
        ka: 'გერგეთის სათადარიგო სტარტი. როცა თავისუფლების მოედანი გადატვირთულია, ავტობუსები შეიძლება აქედან დაიწყონ.',
        ru: 'Запасной старт на Гергети. Когда площадь Свободы перекрывают из-за митинга, парада или события, автобусы стартуют отсюда.',
      },
    },
  },
  toTbilisi: {
    '1:3078': {
      badge: { en: 'Center', ka: 'ცენტრი', ru: 'Центр' },
      hint: {
        en: 'Kojori center by Nikora, easy landmark for pickups.',
        ka: 'კოჯრის ცენტრი ნიკორასთან, მარტივი ნიშნული შეხვედრისთვის.',
        ru: 'Центр Коджори у Никоры, простой ориентир для посадки.',
      },
    },
    '1:4186': {
      badge: { en: 'Azeula', ka: 'აზეულა', ru: 'Азеула' },
      hint: {
        en: 'First Kojori-side stop and closest one to Azeula.',
        ka: 'კოჯრის მხრიდან პირველი გაჩერება და აზეულასთან ყველაზე ახლოს.',
        ru: 'Первая остановка со стороны Коджори и ближайшая к Азеуле.',
      },
    },
    '1:2856': {
      badge: { en: 'Local', ka: 'ლოკალური', ru: 'Местная' },
      hint: {
        en: 'Vazha-Pshavela-side Kojori stop.',
        ka: 'კოჯრის ვაჟა-ფშაველას მხარის გაჩერება.',
        ru: 'Остановка Коджори со стороны Важа-Пшавела.',
      },
    },
    '1:2139': {
      badge: { en: 'Trail warm-up', ka: 'ტრელები', ru: 'Разогрев' },
      hint: {
        en: 'Last biker-friendly stop before the warm-up trails.',
        ka: 'ბაიკერებისთვის ბოლო მოსახერხებელი გაჩერება გასახურებელ ტრელებამდე.',
        ru: 'Последняя удобная для байкеров остановка перед разогревочными трейлами.',
      },
    },
    '1:3782': {
      badge: { en: 'Neighborhood', ka: 'უბანი', ru: 'Рядом' },
      hint: {
        en: 'Quiet Chkheidze-side stop for this side of Kojori.',
        ka: 'ჩხეიძის მხარეს მშვიდი გაჩერება კოჯრის ამ ნაწილისთვის.',
        ru: 'Тихая остановка со стороны Чхеидзе для этой части Коджори.',
      },
    },
    '1:3537': {
      badge: { en: 'Neighborhood', ka: 'უბანი', ru: 'Рядом' },
      hint: {
        en: 'Baratashvili-side stop, another close local option.',
        ka: 'ბარათაშვილის მხარის გაჩერება, კიდევ ერთი ახლო ადგილობრივი ვარიანტი.',
        ru: 'Остановка со стороны Бараташвили, еще один близкий местный вариант.',
      },
    },
  },
};

export function getCuratedStopIds(direction: StopDirection) {
  return CURATED_STOP_IDS[direction];
}

export function getStopCuration(
  direction: StopDirection,
  stopId: string,
  language: ResolvedLanguage,
) {
  const curation = CURATED_STOP_COPY[direction][stopId];
  if (!curation) return undefined;

  return {
    badge: curation.badge[language],
    hint: curation.hint[language],
  };
}
