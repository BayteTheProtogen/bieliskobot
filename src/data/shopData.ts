export interface ShopItem {
    id: string;
    name: string;
    description: string;
    price: number;
    category: 'legal' | 'weapons' | 'tools';
    type: 'LICENSE' | 'WEAPON' | 'TOOL' | 'INSURANCE';
    roleId?: string;
    durationHours?: number; // Dla ubezpieczeń
}

export const SHOP_ITEMS: ShopItem[] = [
    // LIGALNE / DOKUMENTY (Kategoria 1)
    {
        id: 'pozwolenie_bron',
        name: 'Pozwolenie na broń',
        description: 'Licencja uprawniająca do legalnego noszenia broni palnej.',
        price: 8000,
        category: 'legal',
        type: 'LICENSE',
        roleId: '1490070070515466351'
    },
    {
        id: 'prawo_jazdy_b',
        name: 'Prawo jazdy Kat. B',
        description: 'Uprawnienia do prowadzenia samochodów osobowych.',
        price: 3000,
        category: 'legal',
        type: 'LICENSE',
        roleId: '1490071265464029274'
    },
    {
        id: 'prawo_jazdy_a',
        name: 'Prawo jazdy Kat. A',
        description: 'Uprawnienia do prowadzenia motocykli.',
        price: 2500,
        category: 'legal',
        type: 'LICENSE',
        roleId: '1490071187160830243'
    },
    {
        id: 'ubezpieczenie_24h',
        name: 'Ubezpieczenie na zdrowie (24h)',
        description: 'Podstawowe ubezpieczenie medyczne na okres 24 godzin.',
        price: 100,
        category: 'legal',
        type: 'INSURANCE',
        roleId: '1490664549605572638',
        durationHours: 24
    },
    {
        id: 'ubezpieczenie_7d',
        name: 'Ubezpieczenie na zdrowie (Tydzień)',
        description: 'Ubezpieczenie medyczne ważne przez całe 7 dni.',
        price: 500,
        category: 'legal',
        type: 'INSURANCE',
        roleId: '1490664549605572638', // To samo ID co dla 24h, zarządzanie datą i tak będzie leżało po stronie bazy
        durationHours: 168 // 7 * 24
    },

    // BROŃ (Kategoria 2)
    {
        id: 'beretta_m9',
        name: 'Beretta M9',
        description: 'Niezawodny pistolet samopowtarzalny.',
        price: 29000,
        category: 'weapons',
        type: 'WEAPON',
        roleId: '1490071327934124226'
    },
    {
        id: 'colt_m1911',
        name: 'Colt M1911',
        description: 'Klasyczny, uderzająco skuteczny pistolet.',
        price: 29000,
        category: 'weapons',
        type: 'WEAPON',
        roleId: '1490074346448883753'
    },
    {
        id: 'noz',
        name: 'Nóż bojowy',
        description: 'Ostre narzędzie przeznaczone do walki z bliska.',
        price: 5000,
        category: 'weapons',
        type: 'WEAPON',
        roleId: '1490072219110609106'
    },
    {
        id: 'baseball_bat',
        name: 'Kij Baseballowy',
        description: 'Drewniany kij sportowy o wielu zastosowaniach.',
        price: 2000,
        category: 'weapons',
        type: 'WEAPON',
        roleId: '1490662690794766509'
    },

    // NARZĘDZIA (Kategoria 3)
    {
        id: 'lockpick',
        name: 'Lockpick',
        description: 'Zestaw używany do otwierania zamków bez klucza.',
        price: 3000,
        category: 'tools',
        type: 'TOOL',
        roleId: '1490664504462409728'
    },
    {
        id: 'glass_cutter',
        name: 'Glass Cutter',
        description: 'Precyzyjne urządzenie do cięcia szyb.',
        price: 5000,
        category: 'tools',
        type: 'TOOL',
        roleId: '1490076198678827040'
    }
];

export function getItemsByCategory(category: 'legal' | 'weapons' | 'tools'): ShopItem[] {
    return SHOP_ITEMS.filter(item => item.category === category);
}

export function getItemById(id: string): ShopItem | undefined {
    return SHOP_ITEMS.find(item => item.id === id);
}
