
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Bus, MapPin, Calendar, Ticket, Bell, Info, AlertTriangle, ChevronRight, ChevronLeft, Filter, X, Image as ImageIcon, Send, Plus, Music, CreditCard, CheckCircle, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Suppress known Google Maps API IntersectionObserver error when unmounting map container
// Also suppress Directions Service billing errors to prevent app crashes
if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => {
        if (e.message && (e.message.includes('IntersectionObserver') || e.message.includes('Directions Service') || e.message.includes('DIRECTIONS_ROUTE'))) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    });
    window.addEventListener('unhandledrejection', (e) => {
        if (e.reason && e.reason.message && (e.reason.message.includes('IntersectionObserver') || e.reason.message.includes('Directions Service') || e.reason.message.includes('DIRECTIONS_ROUTE'))) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    });
    
    // Suppress console.error for these specific Google Maps API warnings
    const originalConsoleError = console.error;
    console.error = function(...args) {
        if (args.length > 0) {
            const arg = args[0];
            const msg = typeof arg === 'string' ? arg : (arg instanceof Error ? arg.message : '');
            if (msg && (
                msg.includes('IntersectionObserver') || 
                msg.includes('Directions Service') || 
                msg.includes('DIRECTIONS_ROUTE')
            )) {
                return; // Suppress
            }
        }
        originalConsoleError.apply(console, args);
    };
}

// NOTE: A simple cropper is simulated. In a real app, a library like 'react-easy-crop' would be used.
import Cropper, { Area } from 'react-easy-crop'; 

// Fix: Declare google on the window object for better type safety with Google Maps API.
declare global {
  interface Window {
    google: any;
    initMap: () => void;
    gm_authFailure: () => void;
  }
}

type Screen = 'welcome' | 'auth' | 'apiKey' | 'home' | 'profile' | 'messages';

type MediaItem = {
    id: string;
    type: 'image' | 'video';
    url: string; // data URL
};

type ArchiveItem = {
    id:string;
    media: MediaItem[];
    title: string;
    description: string;
};

type Announcement = {
    id: string;
    festivalName: string;
    title: string;
    content: string;
    timestamp: string;
    author: string;
    authorInitials: string;
};

type Festival = {
    id: string;
    name: string;
    year: string;
    dates: string;
    location: string;
    lineup: string;
    kktix: string;
    isFree: boolean;
    isSoldOut?: boolean;
    isEnded?: boolean;
    transportation?: string;
    lat?: number;
    lng?: number;
};

// Add start and end date properties after parsing
type FestivalWithDates = Festival & {
    start: Date;
    end: Date;
};

type Performance = {
    time: string;
    artist: string;
};

type StageSchedule = {
    [stageName: string]: Performance[];
};

type DailyTimetable = {
    [date: string]: StageSchedule; // date format: YYYY-MM-DD
};

type Timetables = {
    [festivalId: string]: DailyTimetable;
};

type CarpoolTrip = {
    id: string;
    festivalName: string;
    origin: string;
    departureTime: string;
    driver: {
        name: string;
        initials: string;
    };
    notes: string;
};

type AccommodationListing = {
    id: string;
    festivalName: string;
    host: {
        name: string;
        initials: string;
    };
    address: string;
    checkInTime: string;
    pricePerNight: number;
    description: string;
    photos: string[]; // data URLs
    position?: { x: number; y: number }; // Added for map integration
};

type Message = {
  id: string;
  text: string;
  imageUrl?: string;
  sender: 'user' | 'other';
  timestamp: Date;
};

type ConversationParticipant = {
    name: string;
    initials: string;
};

type Conversation = {
    id: string; // e.g., 'carpool-c1' or 'accommodation-a1'
    participant: ConversationParticipant;
    topic: string; // e.g., '前往 火球祭'
    messages: Message[];
};

type CustomScheduleItem = {
    id: string;
    time: string;
    activity: string;
};

type CustomSchedules = {
    [date: string]: { title: string; items: CustomScheduleItem[] }; // date format: YYYY-MM-DD
};

type MapPoint = {
    id: string;
    name: string;
    type: 'stage' | 'food' | 'restroom' | 'info' | 'festival';
    position: { x: number; y: number }; // Percentage values
    lat: number;
    lng: number;
};

type Friend = {
    id: string;
    name: string;
    initials: string;
    status: string;
    position: { x: number; y: number }; // Percentage values
    lat: number;
    lng: number;
};


const friendsData: Friend[] = [
    { id: 'f1', name: 'Casey', initials: 'C', status: '在火舞台前面', position: { x: 38, y: 40 }, lat: 25.0066, lng: 121.20134 },
    { id: 'f2', name: 'Alex', initials: 'A', status: '美食區排隊中', position: { x: 85, y: 55 }, lat: 25.00615, lng: 121.20275 },
    { id: 'f3', name: 'Ben', initials: 'B', status: '球舞台右側', position: { x: 70, y: 35 }, lat: 25.00675, lng: 121.2023 },
];

const festivalMapData: MapPoint[] = [
    { id: 'fire-stage', name: '火舞台', type: 'stage', position: { x: 35, y: 25 }, lat: 25.00705, lng: 121.20125 },
    { id: 'ball-stage', name: '球舞台', type: 'stage', position: { x: 65, y: 25 }, lat: 25.00705, lng: 121.20215 },
    { id: 'm3', name: '美食區', type: 'food', position: { x: 85, y: 50 }, lat: 25.0063, lng: 121.20275 },
    { id: 'm4', name: '服務台', type: 'info', position: { x: 15, y: 50 }, lat: 25.0063, lng: 121.20065 },
    { id: 'm5', name: '廁所', type: 'restroom', position: { x: 50, y: 95 }, lat: 25.00495, lng: 121.2017 },
];

const accommodationData: AccommodationListing[] = [
    {
        id: 'a1',
        festivalName: '火球祭', // 火球祭 2024
        host: { name: 'User', initials: 'U' },
        address: '桃園市中壢區青埔路二段',
        checkInTime: '15:00',
        pricePerNight: 800,
        description: '客廳沙發床，離棒球場走路10分鐘，限女生。有養貓。',
        photos: [], // In a real app, these would be image URLs
        position: { x: 10, y: 10 },
    },
    {
        id: 'a2',
        festivalName: '浪人祭', // 浪人祭 2024
        host: { name: 'Frank', initials: 'F' },
        address: '台南市安平區安北路',
        checkInTime: '14:00',
        pricePerNight: 1200,
        description: '雙人床位*2，近會場。提供簡單早餐。',
        photos: [],
    },
    {
        id: 'a3',
        festivalName: '火球祭', // 火球祭 2024
        host: { name: 'Gina', initials: 'G' },
        address: '桃園高鐵站附近',
        checkInTime: '18:00',
        pricePerNight: 1000,
        description: '雙人房，可搭機捷到會場。',
        photos: [],
        position: { x: 5, y: 90 },
    },
];

const carpoolData: CarpoolTrip[] = [
    {
        id: 'c1',
        festivalName: '火球祭', // 火球祭 2024
        origin: '台北車站',
        departureTime: '2024-11-30T08:00',
        driver: { name: 'User', initials: 'U' },
        notes: '希望分攤油錢，車內禁菸，可放一個登機箱。',
    },
    {
        id: 'c2',
        festivalName: '浪人祭', // 浪人祭 2024
        origin: '台中高鐵站',
        departureTime: '2024-10-05T10:30',
        driver: { name: 'Alex', initials: 'A' },
        notes: '包車，謝謝。',
    },
    {
        id: 'c3',
        festivalName: '火球祭', // 火球祭 2024
        origin: '新竹科學園區',
        departureTime: '2024-11-30T09:00',
        driver: { name: 'Casey', initials: 'C' },
        notes: '我是駕駛，還有兩個空位。',
    },
     {
        id: 'c4',
        festivalName: '浪人祭', // 浪人祭 2025
        origin: '高雄捷運鹽埕埔站',
        departureTime: '2025-10-17T12:00',
        driver: { name: 'David', initials: 'D' },
        notes: '還有一個位置，只載女生，車資200。',
    },
];

const conversationsData: Conversation[] = [
    {
        id: 'c1',
        participant: { name: 'Ben', initials: 'B' },
        topic: '前往 火球祭',
        messages: [
            { id: 'm1', text: '請問還有位子嗎？我只有一個後背包', sender: 'user', timestamp: new Date() },
            { id: 'm2', text: '有喔！歡迎！', sender: 'other', timestamp: new Date() },
        ]
    },
    {
        id: 'a1',
        participant: { name: 'Emily', initials: 'E' },
        topic: '火球祭住宿',
        messages: [
            { id: 'm3', text: '請問貓咪會過敏嗎？', sender: 'other', timestamp: new Date() },
        ]
    }
];

const timetablesData: Timetables = {
    // 132: 台灣祭 Taiwan Music Festival 2026
    '132': {
        '2026-04-03': {
            '南方舞台': [
                { time: '13:40-14:20', artist: '宋德鶴' },
                { time: '15:00-15:40', artist: '八十八顆芭樂籽' },
                { time: '16:20-17:00', artist: 'SHOOTUP' },
                { time: '17:40-18:20', artist: 'ROTTENGRAFFTY (JP)' },
                { time: '19:00-19:40', artist: '福夢FUMON' },
                { time: '20:20-21:00', artist: '無妄合作社' },
                { time: '22:00-22:40', artist: 'deca joins' }
            ],
            '大唱舞台': [
                { time: '13:00-13:40', artist: '海岸乾杯' },
                { time: '14:20-15:00', artist: '葵剛 Kuei Gang' },
                { time: '15:40-16:20', artist: '帕崎拉 PACHILA' },
                { time: '17:00-17:40', artist: '林頤原 Euan' },
                { time: '18:20-19:00', artist: '四星球（JP)' },
                { time: '19:40-20:20', artist: 'LOSTAGE (JP)' },
                { time: '21:00-21:40', artist: 'babychair (MY)' }
            ]
        },
        '2026-04-04': {
            '南方舞台': [
                { time: '13:40-14:20', artist: 'Sabrina 胡恂舞' },
                { time: '15:00-15:40', artist: 'P!SCO Feat.海洋家族' },
                { time: '16:20-17:00', artist: 'The Dinosaur\'s Skin 恐龍的皮' },
                { time: '17:40-18:20', artist: 'OBSESS' },
                { time: '19:00-19:40', artist: '固定客 Feat 馬克SAVAGE.M' },
                { time: '20:20-21:00', artist: '怕胖團 PAPUN BAND' },
                { time: '22:00-22:40', artist: '周湯豪NICKTHEREAL' }
            ],
            '大唱舞台': [
                { time: '13:00-13:40', artist: '吾橋有水 FloodingBridge' },
                { time: '14:20-15:00', artist: 'Slowing Oscillation 斯洛頻率' },
                { time: '15:40-16:20', artist: '核果人NUTS' },
                { time: '17:00-17:40', artist: '沈默紳士' },
                { time: '18:20-19:00', artist: '步行者' },
                { time: '19:40-20:20', artist: 'EVENFALL 薄暮' },
                { time: '21:00-21:40', artist: 'TRAGEDY OF MURDER (TH)' }
            ]
        },
        '2026-04-05': {
            '南方舞台': [
                { time: '13:40-14:20', artist: 'Traveller旅人' },
                { time: '15:00-15:40', artist: '溫室雜草' },
                { time: '16:20-17:00', artist: 'M.V.M X 百合花' },
                { time: '17:40-18:20', artist: '南西肯恩' },
                { time: '19:00-19:40', artist: '傻子與白痴' },
                { time: '20:40-21:20', artist: '滅火器Fire EX.' },
                { time: '22:20-23:00', artist: '盧廣仲' }
            ],
            '大唱舞台': [
                { time: '13:00-13:40', artist: 'Tickle Tickle癢癢' },
                { time: '14:20-15:00', artist: '工口紳士' },
                { time: '15:40-16:20', artist: 'SONNIE 桑尼' },
                { time: '17:00-17:40', artist: '閃閃閃閃' },
                { time: '18:20-19:00', artist: '紙鳶' },
                { time: '19:40-20:20', artist: '眠氣Hypersomnia' },
                { time: '21:20-22:00', artist: '等阮返來' }
            ]
        }
    },
    // 29: 火球祭 FireBall 2025
    '29': {
        '2025-11-22': {
            'Fire Stage': [
                { time: '12:00-12:40', artist: 'Opening Act: 胖虎' },
                { time: '13:00-13:40', artist: 'Empty ORio' },
                { time: '14:00-14:40', artist: '隨性 Random' },
                { time: '15:20-16:00', artist: '血肉果汁機' },
                { time: '16:40-17:20', artist: 'Mongol800 (JP)' },
                { time: '18:00-18:40', artist: 'ACIDMAN (JP)' },
                { time: '19:20-20:00', artist: '滅火器 Fire EX.' },
                { time: '20:40-21:30', artist: 'Headliner: ELLEGARDEN' },
            ],
            'Ball Stage': [
                { time: '12:30-13:10', artist: 'Robot Swing' },
                { time: '13:30-14:10', artist: '恐龍的皮' },
                { time: '14:50-15:30', artist: '美秀集團' },
                { time: '16:10-16:50', artist: '大象體操' },
                { time: '17:30-18:10', artist: 'TRASH' },
                { time: '18:50-19:30', artist: 'Dune Rats (AU)' },
            ]
        },
        '2025-11-23': {
            'Fire Stage': [
                { time: '12:00-12:40', artist: '粗大Band' },
                { time: '13:00-13:40', artist: 'P!SCO' },
                { time: '14:00-14:40', artist: '怕胖團' },
                { time: '15:20-16:00', artist: '鄭宜農' },
                { time: '16:40-17:20', artist: '10-FEET (JP)' },
                { time: '18:00-18:40', artist: 'HEY-SMITH (JP)' },
                { time: '19:20-20:10', artist: '滅火器 Fire EX. (Special Set)' },
            ],
            'Ball Stage': [
                { time: '12:30-13:10', artist: '芒果醬' },
                { time: '13:30-14:10', artist: '溫蒂漫步' },
                { time: '14:50-15:30', artist: '拍謝少年' },
                { time: '16:10-16:50', artist: 'Leo王' },
                { time: '17:30-18:10', artist: '國蛋 GorDoN' },
            ]
        }
    },
    // 31: 浮現祭 Emerge 2025
    '31': {
        '2025-02-22': {
            '浮現舞台': [
                { time: '11:00-11:40', artist: '福夢 FUMON' },
                { time: '12:40-13:20', artist: 'icyball 冰球樂團' },
                { time: '14:20-15:00', artist: '無妄合作社' },
                { time: '16:00-16:40', artist: '椅子樂團' },
                { time: '17:40-18:20', artist: '溫蒂漫步' },
                { time: '19:20-20:00', artist: '麋先生' },
                { time: '21:00-21:40', artist: 'KANA-BOON' },
            ],
            '光景舞台': [
                { time: '11:50-12:30', artist: 'P!SCO' },
                { time: '13:30-14:10', artist: 'Dragon Pony' },
                { time: '15:10-15:50', artist: '動物園釘子戶' },
                { time: '16:50-17:30', artist: '粗大Band' },
                { time: '18:30-19:10', artist: 'hue' },
                { time: '20:10-20:50', artist: '神聖かまってちゃん' },
            ]
        },
        '2025-02-23': {
            '浮現舞台': [
                { time: '11:00-11:40', artist: '甜約翰' },
                { time: '12:40-13:20', artist: '老王樂隊' },
                { time: '14:20-15:00', artist: 'HUSH' },
                { time: '16:00-16:40', artist: 'Kroi' },
                { time: '17:40-18:20', artist: '芒果醬' },
                { time: '19:20-20:00', artist: '拍謝少年' },
                { time: '21:00-21:40', artist: '美秀集團' },
            ],
            '光景舞台': [
                { time: '11:50-12:30', artist: '老破麻' },
                { time: '13:30-14:10', artist: 'Rolling Quartz' },
                { time: '15:10-15:50', artist: '我是機車少女' },
                { time: '16:50-17:30', artist: '溫室雜草' },
                { time: '18:30-19:10', artist: 'THE TOYS + YOURMOO' },
                { time: '20:10-20:50', artist: '當代電影大師' },
            ]
        }
    },
    // 16: 大港開唱 Megaport 2025
    '16': {
        '2025-03-29': {
            '南壩天': [
                { time: '12:30-13:10', artist: '傷心欲絕' },
                { time: '14:10-14:50', artist: '溫蒂漫步' },
                { time: '15:50-16:30', artist: 'BATTLES' },
                { time: '17:30-18:10', artist: 'Creepy Nuts' },
                { time: '19:10-19:50', artist: 'UVERworld' },
                { time: '21:10-21:50', artist: '閃靈' },
            ],
            '海龍王': [
                { time: '13:10-13:50', artist: '再會陳一郎' },
                { time: '14:40-15:20', artist: 'VH' },
                { time: '16:00-16:40', artist: 'EmptyORio' },
                { time: '17:20-18:00', artist: 'yangskinny' },
                { time: '18:40-19:20', artist: 'Crossfaith' },
                { time: '20:10-21:00', artist: 'THAT’S MY SHHH' },
            ]
        },
        '2025-03-30': {
            '南壩天': [
                { time: '12:30-13:10', artist: '無妄合作社' },
                { time: '14:10-14:50', artist: '美秀集團' },
                { time: '15:50-16:30', artist: 'Chilli Beans' },
                { time: '17:30-18:10', artist: '血肉果汁機' },
                { time: '19:10-19:50', artist: '拍謝少年' },
                { time: '21:10-21:50', artist: 'THE FLAMING LIPS' },
            ],
            '海龍王': [
                { time: '13:10-13:50', artist: 'FUTURE AFTER A SECOND' },
                { time: '14:40-15:20', artist: 'WONK' },
                { time: '16:00-16:40', artist: 'Hello Nico' },
                { time: '17:20-18:00', artist: '岡崎體育' },
                { time: '18:40-19:20', artist: '傻子與白痴' },
                { time: '20:10-21:00', artist: 'THE SPELLBOUND' },
            ]
        }
    },
    // 25: 桃園鐵玫瑰 Iron Rose 2025
    '25': {
        '2025-10-04': {
            '玫瑰舞台': [
                { time: '16:00-16:40', artist: '沈默紳士' },
                { time: '16:40-17:20', artist: '梁河懸' },
                { time: '17:20-18:00', artist: 'How Z' },
                { time: '18:00-18:40', artist: '陳華' },
                { time: '18:40-19:25', artist: '鼓鼓' },
                { time: '19:25-20:20', artist: '青春未來式' },
                { time: '20:20-21:00', artist: '高爾宣' },
            ]
        },
        '2025-10-05': {
            '玫瑰舞台': [
                { time: '15:45-16:30', artist: '你阿伯' },
                { time: '16:30-17:15', artist: '東部壞男孩' },
                { time: '17:15-18:00', artist: '夕陽武士' },
                { time: '18:00-18:45', artist: 'FUTURE AFTER A SECOND' },
                { time: '18:45-19:30', artist: '同根生' },
                { time: '19:30-20:20', artist: '血肉果汁機' },
                { time: '20:20-21:10', artist: 'TRASH' },
            ]
        }
    },
    // 24: 浪人祭 Vagabond 2025
    '24': {
        '2025-10-17': {
            '鯤鯓舞台': [
                { time: '14:30-15:10', artist: '宋柏緯' },
                { time: '16:10-16:50', artist: '海豚刑警' },
                { time: '17:50-18:30', artist: 'Terminal Sleep' },
                { time: '19:30-20:10', artist: '麋先生' },
                { time: '21:10-21:50', artist: '美秀集團' },
            ],
            '劍獅舞台': [
                { time: '15:20-16:00', artist: 'hue' },
                { time: '17:00-17:40', artist: '晨曦光廊' },
                { time: '18:40-19:20', artist: 'VH' },
                { time: '20:20-21:00', artist: '秋山黃色' },
            ]
        },
        '2025-10-18': {
            '鯤鯓舞台': [
                { time: '14:30-15:10', artist: '絲襪小姐' },
                { time: '16:10-16:50', artist: '八十八顆芭樂籽' },
                { time: '17:50-18:30', artist: 'James Alyn' },
                { time: '19:30-20:10', artist: 'CreepHyp' },
                { time: '21:10-21:50', artist: '血肉果汁機' },
            ],
            '劍獅舞台': [
                { time: '15:20-16:00', artist: '芒果醬' },
                { time: '17:00-17:40', artist: '恐龍的皮' },
                { time: '18:40-19:20', artist: '阿爆' },
                { time: '20:20-21:00', artist: 'The Novembers' },
            ]
        },
        '2025-10-19': {
            '鯤鯓舞台': [
                { time: '14:30-15:10', artist: '持修' },
                { time: '16:10-16:50', artist: 'Bye Bye Badman' },
                { time: '17:50-18:30', artist: '阿飛西雅' },
                { time: '19:30-20:10', artist: 'James Alyn' },
                { time: '21:10-21:50', artist: '康士坦的變化球' },
            ],
            '劍獅舞台': [
                { time: '15:20-16:00', artist: '鄭宜農' },
                { time: '17:00-17:40', artist: '呂士軒' },
                { time: '18:40-19:20', artist: '傷心欲絕' },
                { time: '20:20-21:00', artist: '滅火器' },
            ]
        }
    },
    // 17: 台灣祭 Taiwan Music Festival 2025
    '17': {
        '2025-04-03': {
            '南方主舞台': [
                { time: '13:40-14:20', artist: '芒果醬' },
                { time: '15:00-15:40', artist: '南西肯恩' },
                { time: '16:20-17:00', artist: 'VH' },
                { time: '17:40-18:20', artist: '冰球樂團' },
                { time: '19:00-19:40', artist: '傻子與白痴' },
                { time: '20:20-21:00', artist: 'DOES' },
                { time: '22:00-22:40', artist: '血肉果汁機' },
            ],
            '大唱副舞台': [
                { time: '13:00-13:40', artist: '火燒島' },
                { time: '14:20-15:00', artist: '胡恂舞' },
                { time: '15:40-16:20', artist: '河紋舞團' },
                { time: '17:00-17:40', artist: '夕陽武士' },
                { time: '18:20-19:00', artist: '庫克' },
                { time: '19:40-20:20', artist: 'FURTHER AFTER A SECOND' },
                { time: '21:00-21:40', artist: '旅人' },
            ]
        },
        '2025-04-04': {
            '南方主舞台': [
                { time: '12:20-13:00', artist: '宋德鶴' },
                { time: '13:40-14:20', artist: '粗大Band' },
                { time: '15:00-15:40', artist: '甜約翰' },
                { time: '16:20-17:00', artist: 'hue' },
                { time: '17:40-18:20', artist: '福夢' },
                { time: '19:00-19:40', artist: '怕胖團' },
                { time: '20:20-21:00', artist: '固定客' },
                { time: '22:00-22:40', artist: 'TRASH' },
            ],
            '大唱副舞台': [
                { time: '13:00-13:40', artist: '步行者' },
                { time: '14:20-15:00', artist: '閃閃閃閃' },
                { time: '15:40-16:20', artist: '擊沈女孩' },
                { time: '17:00-17:40', artist: 'KNOCK OUT MONEY' },
                { time: '18:20-19:00', artist: '逆流' },
                { time: '19:40-20:20', artist: 'ガガガ SP' },
                { time: '21:00-21:40', artist: 'P!SCO' },
            ]
        },
        '2025-04-05': {
            '南方主舞台': [
                { time: '12:20-13:00', artist: '公館青少年' },
                { time: '13:40-14:20', artist: 'SHOOT UP' },
                { time: '15:00-15:40', artist: '無妄合作社' },
                { time: '16:20-17:00', artist: '胡凱兒' },
                { time: '17:40-18:20', artist: '宇宙人' },
                { time: '19:00-19:40', artist: 'OBSESS' },
                { time: '20:20-21:00', artist: '美秀集團' },
                { time: '22:00-22:40', artist: '滅火器' },
            ],
            '大唱副舞台': [
                { time: '13:00-13:40', artist: '阿橘' },
                { time: '14:20-15:00', artist: '林潔心' },
                { time: '15:40-16:20', artist: '葵剛' },
                { time: '17:00-17:40', artist: '撞克茫客' },
                { time: '18:20-19:00', artist: '癢癢' },
                { time: '19:40-20:20', artist: 'How Z' },
                { time: '21:00-21:40', artist: '凡枯' },
            ]
        }
    },
    // 18: Savage 2025
    '18': {
        '2025-04-26': {
            '虎嘯': [
                { time: '12:40-13:20', artist: 'SHOOTUP' },
                { time: '14:20-15:00', artist: '無妄合作社' },
                { time: '16:00-16:40', artist: 'Solitude Is Bliss' },
                { time: '17:40-18:20', artist: 'Within Destruction' },
                { time: '19:20-20:00', artist: '那我懂你意思了' },
                { time: '21:00-22:00', artist: 'Beach Fossils' },
            ],
            '獅吼': [
                { time: '13:30-14:10', artist: '福夢' },
                { time: '15:10-15:50', artist: '嬉斑子樂團' },
                { time: '16:50-17:30', artist: '午夜乒乓' },
                { time: '18:30-19:10', artist: '隨性' },
                { time: '20:10-20:50', artist: 'honeydip' },
            ]
        },
        '2025-04-27': {
            '虎嘯': [
                { time: '12:40-13:20', artist: '布萊梅' },
                { time: '14:20-15:00', artist: '鳳小岳＆歴克力柿子' },
                { time: '16:00-16:40', artist: 'Skaraoke' },
                { time: '17:40-18:20', artist: 'Phum Viphurit' },
                { time: '19:20-20:00', artist: 'Hello Nico' },
                { time: '21:00-22:00', artist: '蛋堡' },
            ],
            '獅吼': [
                { time: '13:30-14:10', artist: 'hue' },
                { time: '15:10-15:50', artist: '餵飽豬' },
                { time: '16:50-17:30', artist: '百合花' },
                { time: '18:30-19:10', artist: 'Johnnivan' },
                { time: '20:10-20:50', artist: 'TOSH' },
            ]
        }
    },
    // 21: Taichill 2025
    '21': {
        '2025-07-12': {
            '台秋舞台': [
                { time: '12:50-13:30', artist: '溫室雜草' },
                { time: '14:30-15:10', artist: 'TOKYO HONEY TRAP' },
                { time: '16:10-16:50', artist: 'KUZIRA' },
                { time: '17:50-18:30', artist: '拍謝少年' },
                { time: '19:30-20:10', artist: '傻子與白痴' },
                { time: '21:10-21:50', artist: '固定客' },
            ],
            '唱秋舞台': [
                { time: '12:00-12:40', artist: '動漫派' },
                { time: '13:40-14:20', artist: 'P!SCO' },
                { time: '15:20-16:00', artist: '公館青少年' },
                { time: '17:00-17:40', artist: '晨曦光廊' },
                { time: '18:40-19:20', artist: '老破麻' },
                { time: '20:20-21:00', artist: '國蛋' },
            ]
        },
        '2025-07-13': {
            '台秋舞台': [
                { time: '12:50-13:30', artist: '擊沈女孩' },
                { time: '14:30-15:10', artist: '胡凱兒' },
                { time: '16:10-16:50', artist: 'KNOCK OUT MONKEY' },
                { time: '17:50-18:30', artist: 'OBSESS' },
                { time: '19:30-20:10', artist: '血肉果汁機' },
                { time: '21:10-21:50', artist: '美秀集團' },
            ],
            '唱秋舞台': [
                { time: '12:00-12:40', artist: '動漫派' },
                { time: '13:40-14:20', artist: '粗大BAND' },
                { time: '15:20-16:00', artist: '福夢' },
                { time: '17:00-17:40', artist: 'EmptyORio' },
                { time: '18:40-19:20', artist: '溫蒂漫步' },
                { time: '20:20-21:00', artist: '怕胖團' },
            ]
        }
    },
    // 23: Oursea 2025
    '23': {
        '2025-08-23': {
            '濱海舞台': [
                { time: '12:10-12:50', artist: '上山' },
                { time: '13:10-13:50', artist: '粗大Band' },
                { time: '14:40-15:20', artist: 'Apartment Khunpa' },
                { time: '16:10-16:50', artist: '庸俗救星' },
                { time: '17:40-18:20', artist: '溫室雜草' },
                { time: '19:10-19:50', artist: '怕胖團' },
                { time: '21:00-21:40', artist: '美秀集團' },
            ],
            '潮汐舞台': [
                { time: '13:50-14:40', artist: 'DJ AGI' },
                { time: '15:20-16:10', artist: 'SERUMA WILIM' },
                { time: '16:50-17:40', artist: '李晉瑋' },
                { time: '18:20-19:10', artist: 'Jimmy H.' },
            ]
        },
        '2025-08-24': {
            '濱海舞台': [
                { time: '13:10-13:50', artist: '薄暮' },
                { time: '14:40-15:20', artist: '老破麻' },
                { time: '16:10-16:50', artist: '公館青少年' },
                { time: '17:40-18:20', artist: '福夢' },
                { time: '19:10-19:50', artist: '芒果醬' },
                { time: '21:00-21:40', artist: '冰球樂團' },
            ],
            '潮汐舞台': [
                { time: '13:50-14:40', artist: '西屯純愛組' },
                { time: '15:20-16:10', artist: 'DEADKAT' },
                { time: '18:20-19:10', artist: 'Ruka Banana Pure makeR' },
            ]
        }
    },
    // 26: Rock Taichung 2025
    '26': {
        '2025-10-11': {
            '能量舞台': [
                { time: '12:30-13:10', artist: '溫室雜草' },
                { time: '14:10-14:50', artist: '無妄合作社' },
                { time: '15:50-16:30', artist: 'Code•Lee' },
                { time: '17:30-18:10', artist: 'VH' },
                { time: '19:10-19:50', artist: '傻子與白痴' },
                { time: '21:00-21:40', artist: '美秀集團' },
            ],
            '綠色舞台': [
                { time: '12:00-12:40', artist: '問題總部' },
                { time: '13:30-14:10', artist: 'w•o•d' },
                { time: '15:00-15:40', artist: '上山' },
                { time: '16:30-17:10', artist: 'KOLOR' },
                { time: '18:00-18:40', artist: '隨性' },
                { time: '19:30-20:10', artist: 'P!SCO' },
            ]
        },
        '2025-10-12': {
            '能量舞台': [
                { time: '12:40-13:20', artist: 'OBSESS' },
                { time: '14:20-15:00', artist: '當代電影大師' },
                { time: '16:00-16:40', artist: '溫蒂漫步' },
                { time: '17:40-18:20', artist: '芒果醬' },
                { time: '19:20-20:00', artist: 'HUSH' },
                { time: '21:00-21:40', artist: '老王樂隊' },
            ],
            'ROOKIE A GO 舞台': [
                { time: '12:00-12:40', artist: '體熊專科' },
                { time: '13:30-14:10', artist: '我是機車少女' },
                { time: '15:00-15:40', artist: '震樂堂' },
                { time: '16:30-17:10', artist: 'HOME' },
                { time: '18:00-18:40', artist: 'SATOH' },
                { time: '19:30-20:10', artist: '真名子斯' },
            ]
        }
    },
    // 30: Simple Life 2025
    '30': {
        '2025-11-29': {
            '天空舞台': [
                { time: '14:40-15:30', artist: '9m88' },
                { time: '16:00-16:40', artist: '阿肆' },
                { time: '17:20-18:10', artist: '鄭宜農 feat. 李瀧 Lang Lee' },
                { time: '19:00-19:50', artist: '戴佩妮' },
                { time: '20:40-21:25', artist: '林憶蓮' },
            ],
            '微風舞台': [
                { time: '14:00-14:40', artist: '凹與山 Our Shame' },
                { time: '15:30-16:00', artist: '張注助 Giyu Tjulaviya' },
                { time: '16:40-17:20', artist: '就以斯JOYCE feat.PIZZALI' },
                { time: '18:10-18:50', artist: '知更 John Stoniae' },
                { time: '19:50-20:30', artist: '自然捲（魏如萱&奇哥）' },
            ]
        },
        '2025-11-30': {
            '天空舞台': [
                { time: '14:40-15:30', artist: 'YELLOW黃宣' },
                { time: '16:00-16:40', artist: '理想混蛋 Bestards' },
                { time: '17:20-18:10', artist: 'ABAO阿爆 feat. 那屋瓦' },
                { time: '19:00-19:50', artist: '楊乃文' },
                { time: '20:40-21:25', artist: '伍佰&China Blue feat. 李宗盛' },
            ],
            '微風舞台': [
                { time: '14:00-14:40', artist: '王彙筑 Hui Chu Wang' },
                { time: '15:30-16:00', artist: '戴醇君 Saujaljui' },
                { time: '16:40-17:20', artist: 'Theseus忒修斯' },
                { time: '18:10-18:50', artist: '白安ANN' },
                { time: '19:50-20:30', artist: '黃小楨' },
            ]
        }
    },
    // 19: 赤聲躁動 2025
    '19': {
        '2025-05-17': {
            '赤聲舞台': [
                { time: '11:20-12:00', artist: '秋波愛麗' },
                { time: '13:00-13:40', artist: '無妄合作社' },
                { time: '14:40-15:20', artist: '公館青少年' },
                { time: '16:20-17:00', artist: '陳嫺靜' },
                { time: '18:00-18:40', artist: '溫蒂漫步' },
                { time: '19:40-20:20', artist: 'SIX LOUNGE' },
                { time: '21:20-22:00', artist: '血肉果汁機' },
            ],
            '躁動舞台': [
                { time: '12:20-13:00', artist: '上山' },
                { time: '13:50-14:30', artist: 'COLD DEW' },
                { time: '15:30-16:10', artist: '川西奈月' },
                { time: '17:10-17:50', artist: '溫室雜草' },
                { time: '18:50-19:30', artist: 'HARD BOY' },
                { time: '20:20-21:00', artist: '質感流氓' },
            ]
        },
        '2025-05-18': {
            '赤聲舞台': [
                { time: '12:00-12:40', artist: 'hue' },
                { time: '13:40-14:20', artist: 'VH' },
                { time: '15:20-16:00', artist: 'First love is Never Returned' },
                { time: '17:00-17:40', artist: '傷心欲絕' },
                { time: '18:40-19:20', artist: '傻子與白痴' },
                { time: '20:20-21:00', artist: '怕胖團' },
            ],
            '躁動舞台': [
                { time: '12:45-13:25', artist: 'DIZLIKE' },
                { time: '14:20-15:00', artist: 'FunkyMo' },
                { time: '16:00-16:40', artist: 'FAAS' },
                { time: '17:40-18:20', artist: '靈魂沙發' },
                { time: '19:20-20:00', artist: 'Tuesday Beach Club' },
            ]
        }
    },
    // 20: 愛嶼搖滾 2025
    '20': {
        '2025-05-24': {
            '愛搖滾 主舞台': [
                { time: '12:30-13:10', artist: '上山' },
                { time: '13:50-14:30', artist: '忒修斯' },
                { time: '15:10-15:50', artist: '靈魂沙發' },
                { time: '16:30-17:10', artist: '公館青少年' },
                { time: '17:50-18:30', artist: '固定客' },
                { time: '19:30-20:10', artist: '溫室雜草' },
                { time: '21:10-21:50', artist: '宇宙人' },
            ],
            '嶼搖滾 副舞台': [
                { time: '11:50-12:30', artist: '羊米人' },
                { time: '13:10-13:50', artist: '你阿伯' },
                { time: '14:30-15:10', artist: '時不我予' },
                { time: '15:50-16:30', artist: '徐行' },
                { time: '17:10-17:50', artist: '癢癢' },
                { time: '18:30-19:10', artist: '紙鳶' },
                { time: '20:10-20:50', artist: '撞克茫客' },
            ]
        },
        '2025-05-25': {
            '愛搖滾 主舞台': [
                { time: '12:30-13:10', artist: '打倒三明治' },
                { time: '13:50-14:30', artist: '粗大Band' },
                { time: '15:10-15:50', artist: '庸俗救星' },
                { time: '16:30-17:10', artist: '福夢' },
                { time: '17:50-18:30', artist: '甜約翰' },
                { time: '19:30-20:10', artist: '傻子與白痴' },
                { time: '21:10-21:50', artist: '怕胖團' },
            ],
            '嶼搖滾 副舞台': [
                { time: '11:50-12:30', artist: '沈默紳士' },
                { time: '13:10-13:50', artist: '深深一擊' },
                { time: '14:30-15:10', artist: 'DIZLIKE' },
                { time: '15:50-16:30', artist: '鄒序' },
                { time: '17:10-17:50', artist: '薄暮' },
                { time: '18:30-19:10', artist: '旅人' },
                { time: '20:10-20:50', artist: '眠氣' },
            ]
        }
    },
    // 27: 春浪 2025
    '27': {
        '2025-10-31': {
            '晴空': [
                { time: '17:00-17:40', artist: '無妄合作社' },
                { time: '19:00-19:40', artist: 'SUGIZO' },
                { time: '20:40-21:30', artist: '蘇打綠' },
            ],
            '山嵐': [
                { time: '16:10-16:50', artist: '鶴The Crane' },
                { time: '18:00-18:40', artist: 'ASTERISM' },
                { time: '19:50-20:30', artist: 'Awich' },
            ]
        },
        '2025-11-01': {
            '晴空': [
                { time: '13:20-14:00', artist: '桑布伊' },
                { time: '15:10-15:50', artist: 'Penthouse' },
                { time: '17:00-17:40', artist: 'SPYAIR' },
                { time: '19:00-19:40', artist: '美秀集團' },
                { time: '20:40-21:30', artist: '張震嶽' },
            ],
            '山嵐': [
                { time: '12:30-13:10', artist: '夕陽武士' },
                { time: '14:15-14:55', artist: 'WIM' },
                { time: '16:05-16:45', artist: '和平飯店' },
                { time: '17:55-18:35', artist: '王若琳' },
                { time: '19:50-20:30', artist: '國蛋' },
            ]
        },
        '2025-11-02': {
            '晴空': [
                { time: '14:30-15:10', artist: 'Phum Viphurit' },
                { time: '16:10-16:50', artist: '怕胖團' },
                { time: '17:50-18:30', artist: '宇宙人' },
                { time: '19:30-20:15', artist: '馬思唯' },
            ],
            '山嵐': [
                { time: '12:00-12:40', artist: 'Yappy' },
                { time: '13:40-14:20', artist: '李竺芯' },
                { time: '15:20-16:00', artist: 'ADOY' },
                { time: '17:00-17:40', artist: '黃韻玲' },
                { time: '18:40-19:20', artist: '康士坦的變化球' },
            ]
        }
    },
    // 28: 秋OUT 2025
    '28': {
        '2025-10-11': {
            '秋月': [
                { time: '15:30-16:10', artist: 'Andr' },
                { time: '17:10-17:50', artist: 'KID FRESINO' },
                { time: '18:30-19:10', artist: 'Mola Oddity' },
                { time: '20:40-21:55', artist: 'Cornelius' },
            ],
            '秋水': [
                { time: '14:40-15:20', artist: 'Dac Band' },
                { time: '16:20-17:00', artist: '小老虎' },
                { time: '18:00-18:40', artist: 'JADE' },
                { time: '19:40-21:55', artist: 'VOOID' },
            ]
        },
        '2025-10-12': {
            '秋月': [
                { time: '15:30-16:10', artist: '百合花' },
                { time: '17:10-17:50', artist: 'Karencici' },
                { time: '18:30-19:10', artist: '礼賛' },
                { time: '20:40-21:55', artist: '9m88' },
            ],
            '秋水': [
                { time: '14:40-15:20', artist: 'THAT\'S MY SHHH' },
                { time: '16:20-17:00', artist: 'LÜCY' },
                { time: '18:00-18:40', artist: '陳嫺靜' },
                { time: '19:40-21:55', artist: 'Green! Eyes' },
            ]
        }
    },
    // --- 2024 Festivals (Past) ---
    // 1: Emerge 2024
    '1': {
        '2024-02-24': {
            '浮現舞台': [
                { time: '11:00-11:40', artist: '溫蒂漫步' },
                { time: '12:40-13:20', artist: '馬念先' },
                { time: '14:20-15:00', artist: 'Tilly Birds' },
                { time: '16:00-16:40', artist: 'Yabai T-shirts Yasan' },
                { time: '17:40-18:20', artist: 'TRASH' },
                { time: '19:20-20:00', artist: '麋先生' },
                { time: '21:00-21:40', artist: '康士坦的變化球' },
            ],
            '光景舞台': [
                { time: '13:30-14:10', artist: '阿跨面' },
                { time: '15:10-15:50', artist: 'GDJYB' },
                { time: '16:50-17:30', artist: 'P!SCO' },
                { time: '18:30-19:10', artist: 'OBSESS' },
                { time: '20:10-20:50', artist: '怕胖團' },
            ]
        },
        '2024-02-25': {
            '浮現舞台': [
                { time: '11:00-11:40', artist: '163braces' },
                { time: '12:40-13:20', artist: '冰球樂團' },
                { time: '14:20-15:00', artist: '老王樂隊' },
                { time: '16:00-16:40', artist: '荷爾蒙少年' },
                { time: '17:40-18:20', artist: '告五人' },
                { time: '19:20-20:00', artist: '美秀集團' },
                { time: '21:00-21:40', artist: 'ZUTOMAYO' },
            ],
            '光景舞台': [
                { time: '12:00-12:40', artist: '老破麻' },
                { time: '13:30-14:10', artist: '粗大Band' },
                { time: '15:10-15:50', artist: 'FORMOSA' },
                { time: '16:50-17:30', artist: '夜間限定' },
                { time: '18:30-19:10', artist: '傻子與白痴' },
                { time: '20:10-20:50', artist: '拍謝少年' },
            ]
        }
    },
    // 2: Megaport 2024
    '2': {
        '2024-03-30': {
            '南霸天': [
                { time: '12:40-13:20', artist: '大象體操' },
                { time: '14:20-15:00', artist: 'Tizzy Bac' },
                { time: '16:00-16:40', artist: 'Hanabie.' },
                { time: '17:40-18:20', artist: 'SURL' },
                { time: '19:20-20:00', artist: 'Maximum the Hormone' },
                { time: '21:00-21:50', artist: '草東沒有派對' },
            ],
            '海龍王': [
                { time: '13:20-14:00', artist: '閃靈' },
                { time: '14:40-15:20', artist: '非人物種' },
                { time: '16:00-16:40', artist: 'GIGO' },
                { time: '17:20-18:00', artist: '體熊專科' },
                { time: '18:40-19:20', artist: 'BREIMEN' },
                { time: '20:20-21:00', artist: '芒果醬' },
            ]
        },
        '2024-03-31': {
            '南霸天': [
                { time: '12:40-13:20', artist: '李權哲' },
                { time: '14:20-15:00', artist: '滅火器' },
                { time: '16:00-16:40', artist: '康士坦的變化球' },
                { time: '17:40-18:20', artist: 'Avantgardey' },
                { time: '19:20-20:00', artist: '拍謝少年' },
                { time: '21:00-21:50', artist: 'ASIAN KUNG-FU GENERATION' },
            ],
            '海龍王': [
                { time: '13:20-14:00', artist: 'JADE' },
                { time: '14:40-15:20', artist: 'OBSESS' },
                { time: '16:00-16:40', artist: '八十八顆芭樂籽' },
                { time: '17:20-18:00', artist: '謎路人' },
                { time: '18:40-19:20', artist: '毀容姐妹會' },
                { time: '20:20-21:00', artist: 'DEPT' },
            ]
        }
    },
    // 3: Taiwan Festival 2024 (Restored)
    '3': {
        '2024-04-04': {
            '南方主舞台': [
                { time: '12:20-13:00', artist: '閃閃閃閃' },
                { time: '13:40-14:20', artist: '溫蒂漫步' },
                { time: '15:00-15:40', artist: 'JADE' },
                { time: '16:20-17:00', artist: '老破麻' },
                { time: '17:40-18:20', artist: '溫室雜草' },
                { time: '19:00-19:40', artist: '傻子與白痴' },
                { time: '20:20-21:00', artist: '回春丹' },
                { time: '22:00-22:40', artist: '美秀集團' },
            ],
            '大唱副舞台': [
                { time: '13:00-13:40', artist: '憂憂' },
                { time: '14:20-15:00', artist: '老貓偵探社' },
                { time: '15:40-16:20', artist: '海岸乾杯' },
                { time: '17:00-17:40', artist: '庫克' },
                { time: '18:20-19:00', artist: '公館青少年' },
                { time: '19:40-20:20', artist: 'SHOOT UP' },
                { time: '21:00-21:40', artist: 'P!SCO' },
            ]
        },
        '2024-04-05': {
            '南方主舞台': [
                { time: '11:00-11:40', artist: '胡凱兒' },
                { time: '12:20-13:00', artist: '福夢' },
                { time: '13:40-14:20', artist: '老王樂隊' },
                { time: '15:00-15:40', artist: '潤少' },
                { time: '16:20-17:00', artist: '狠操俱樂部' },
                { time: '17:40-18:20', artist: '賤葆大樂隊' },
                { time: '19:00-19:40', artist: '固定客' },
                { time: '20:20-21:00', artist: '怕胖團' },
                { time: '22:00-22:40', artist: '滅火器' },
            ],
            '大唱副舞台': [
                { time: '13:00-13:40', artist: '上山' },
                { time: '14:20-15:00', artist: 'SPECIAL THANKS' },
                { time: '15:40-16:20', artist: 'Pussyliquor' },
                { time: '17:00-17:40', artist: '火燒島' },
                { time: '18:20-19:00', artist: '庸俗救星' },
                { time: '19:40-20:20', artist: 'SABOTEN' },
                { time: '21:00-21:40', artist: '午夜乒乓' },
            ]
        },
        '2024-04-06': {
            '南方主舞台': [
                { time: '11:00-11:40', artist: '粗大Band' },
                { time: '12:20-13:00', artist: '當代電影大師' },
                { time: '13:40-14:20', artist: 'OBSESS' },
                { time: '15:00-15:40', artist: '傷心欲絕' },
                { time: '16:20-17:00', artist: '隨性' },
                { time: '17:40-18:20', artist: '夜間限定' },
                { time: '19:00-19:40', artist: '高爾宣' },
                { time: '20:20-21:00', artist: '拍謝少年' },
                { time: '22:00-22:40', artist: '玖壹壹' },
            ],
            '大唱副舞台': [
                { time: '13:00-13:40', artist: '步行者' },
                { time: '14:20-15:00', artist: '旅人' },
                { time: '15:40-16:20', artist: '忒修斯' },
                { time: '17:00-17:40', artist: 'Fine樂團' },
                { time: '18:20-19:00', artist: 'MANDARK' },
                { time: '19:40-20:20', artist: 'tokyo honey trap' },
                { time: '21:00-21:40', artist: '守夜人' },
            ]
        }
    },
    // 9: Vagabond 2024
    '9': {
        '2024-10-05': {
            '鯤鯓舞台': [
                { time: '09:30-10:10', artist: '滅火器' },
                { time: '11:10-11:50', artist: '大支' },
                { time: '12:50-13:30', artist: '無妄合作社' },
                { time: '14:30-15:10', artist: '李瀧' },
                { time: '16:10-16:50', artist: '打首獄門同好會' },
                { time: '17:50-18:30', artist: '昆蟲白' },
                { time: '19:30-20:10', artist: 'betcover!' },
                { time: '21:20-22:00', artist: '草東沒有派對' },
            ],
            '劍獅舞台': [
                { time: '12:00-12:40', artist: '溫蒂漫步' },
                { time: '14:00-14:40', artist: '拍謝少年' },
                { time: '15:20-16:00', artist: 'Chinese Football' },
                { time: '17:00-17:40', artist: '血肉果汁機' },
                { time: '18:40-19:20', artist: '陳珊妮' },
                { time: '20:30-21:10', artist: '巨大的轟鳴' },
            ]
        },
        '2024-10-06': {
            '鯤鯓舞台': [
                { time: '12:50-13:30', artist: '鳳小岳' },
                { time: '14:30-15:10', artist: '蛙池' },
                { time: '16:10-16:50', artist: '9m88' },
                { time: '17:50-18:30', artist: 'kanekoayano' },
                { time: '19:30-20:10', artist: '水曜日' },
                { time: '21:10-21:50', artist: '老王樂隊' },
            ],
            '劍獅舞台': [
                { time: '12:00-12:40', artist: '當代電影大師' },
                { time: '13:40-14:20', artist: '淺堤' },
                { time: '15:20-16:00', artist: '離婚伝說' },
                { time: '17:00-17:40', artist: '怕胖團' },
                { time: '18:40-19:20', artist: '黃宣' },
                { time: '20:20-21:00', artist: '回聲樂團' },
            ]
        }
    },
    // 10: Iron Rose 2024
    '10': {
        '2024-10-05': {
            '玫瑰舞台': [
                { time: '15:40-16:20', artist: 'DözY' },
                { time: '16:30-17:10', artist: '羊駝小姐' },
                { time: '17:20-18:00', artist: '林曉培ft.郭家瑋' },
                { time: '18:10-18:30', artist: 'Troy、廖海廷' },
                { time: '18:30-19:30', artist: '嘻哈台瘋 比杰、阿跨面、芮鯊' },
                { time: '19:40-20:20', artist: '熊仔' },
                { time: '20:30-21:10', artist: 'Ozone' },
            ]
        },
        '2024-10-06': {
            '玫瑰舞台': [
                { time: '16:00-16:40', artist: '公館青少年' },
                { time: '16:50-17:30', artist: '溫蒂漫步' },
                { time: '17:40-18:10', artist: '大象體操' },
                { time: '18:20-18:50', artist: '壞特？te' },
                { time: '19:00-19:30', artist: '拍謝少年' },
                { time: '19:40-20:20', artist: 'Marz23 ft.GIGO' },
                { time: '20:30-21:10', artist: '宇宙人' },
            ]
        }
    },
    // 11: Takao 2024
    '11': {
        '2024-10-12': {
            '海音': [
                { time: '13:00-13:40', artist: '老王樂隊' },
                { time: '15:00-15:40', artist: '持修' },
                { time: '17:00-17:40', artist: '甜約翰' },
                { time: '19:20-20:00', artist: '安溥' },
                { time: '21:20-22:00', artist: '血肉果汁機' },
            ],
            '海風': [
                { time: '14:00-14:40', artist: '瑪莉咬凱利' },
                { time: '16:00-16:40', artist: '冰球樂團' },
                { time: '18:00-18:40', artist: 'K6劉家凱' },
                { time: '20:20-21:00', artist: '氣志團' },
            ]
        },
        '2024-10-13': {
            '海音': [
                { time: '13:00-13:40', artist: 'HUSH' },
                { time: '15:00-15:40', artist: '理想混蛋' },
                { time: '17:00-17:40', artist: '告五人' },
                { time: '19:20-20:00', artist: '萬方' },
                { time: '21:20-22:00', artist: '滅火器' },
            ],
            '海風': [
                { time: '14:00-14:40', artist: '宇宙人' },
                { time: '16:00-16:40', artist: 'TRASH' },
                { time: '18:00-18:40', artist: 'FLOW' },
                { time: '20:20-21:00', artist: '戴佩妮' },
            ]
        }
    },
    // 12: Rock Taichung 2024
    '12': {
        '2024-10-26': {
            '能量舞台': [
                { time: '12:40-13:20', artist: 'OBSESS' },
                { time: '14:20-15:00', artist: '固定客' },
                { time: '16:00-16:40', artist: 'PassCode' },
                { time: '17:40-18:20', artist: '芒果醬' },
                { time: '19:20-20:00', artist: '甜約翰' },
                { time: '21:00-21:40', artist: '怕胖團' },
            ],
            'ROOKIE A GO 舞台': [
                { time: '12:00-12:40', artist: '薄暮' },
                { time: '13:30-14:10', artist: '倒車入庫' },
                { time: '15:00-15:40', artist: '粗大Band' },
                { time: '16:30-17:10', artist: 'SPENSR' },
                { time: '18:00-18:40', artist: 'Alborg' },
                { time: '19:30-20:10', artist: 'DNA GAINZ' },
            ]
        },
        '2024-10-27': {
            '能量舞台': [
                { time: '12:40-13:20', artist: '溫蒂漫步' },
                { time: '14:20-15:00', artist: 'JADE' },
                { time: '16:00-16:40', artist: '新東京' },
                { time: '17:40-18:20', artist: '傻子與白痴' },
                { time: '19:20-20:00', artist: 'TRASH' },
                { time: '21:00-21:40', artist: '血肉果汁機' },
            ],
            'ROOKIE A GO 舞台': [
                { time: '12:00-12:40', artist: '庸俗救星' },
                { time: '13:30-14:10', artist: 'DUMB.RONG' },
                { time: '15:00-15:40', artist: '福夢' },
                { time: '16:30-17:10', artist: '老破麻' },
                { time: '18:00-18:40', artist: 'BSB' },
                { time: '19:30-20:10', artist: 'P!SCO' },
            ]
        }
    },
    // 15: Fireball 2024
    '15': {
        '2024-11-30': {
            '火舞台': [
                { time: '11:15-11:55', artist: '滅火器' },
                { time: '13:05-13:45', artist: '隨性' },
                { time: '15:00-15:40', artist: '非人物種' },
                { time: '16:55-17:35', artist: '阿爆' },
                { time: '18:45-19:25', artist: '蛋堡' },
                { time: '20:40-21:40', artist: 'ACIDMAN' },
            ],
            '球舞台': [
                { time: '12:10-12:50', artist: 'Sabasister' },
                { time: '14:05-14:45', artist: '大象體操' },
                { time: '16:00-16:40', artist: 'Dune Rats' },
                { time: '17:50-18:30', artist: 'MONGOL 800' },
                { time: '19:45-20:25', artist: '血肉果汁機' },
            ]
        },
        '2024-12-01': {
            '火舞台': [
                { time: '12:10-12:50', artist: '美秀集團' },
                { time: '14:05-14:45', artist: '旺福' },
                { time: '16:00-16:40', artist: 'FUTURE AFTER A SECOND' },
                { time: '17:50-18:30', artist: '傷心欲絕' },
                { time: '19:45-20:25', artist: 'MAN WITH A MISSION' },
            ],
            '球舞台': [
                { time: '11:15-11:55', artist: 'EmptyORio' },
                { time: '13:05-13:45', artist: '胖虎' },
                { time: '15:00-15:40', artist: 'Tokyo Ska Paradise Orchestra' },
                { time: '16:55-17:35', artist: '聲子蟲' },
                { time: '18:45-19:25', artist: '落日飛車' },
                { time: '20:40-21:40', artist: '滅火器' },
            ]
        }
    },
    // 4: 赤聲躁動 2024
    '4': {
        '2024-05-18': {
            '赤聲舞台': [
                { time: '11:20-12:00', artist: 'BIKE' },
                { time: '13:00-13:40', artist: '露波合唱團' },
                { time: '14:40-15:20', artist: '我是機車少女' },
                { time: '16:20-17:00', artist: 'P!SCO' },
                { time: '18:00-18:40', artist: '老破麻' },
                { time: '19:40-20:20', artist: '海豚刑警' },
                { time: '21:20-22:00', artist: '冰球樂團' },
            ],
            '躁動舞台': [
                { time: '12:20-13:00', artist: '桑尼' },
                { time: '13:50-14:30', artist: '公館青少年' },
                { time: '15:30-16:10', artist: '大成' },
                { time: '17:10-17:50', artist: '阿橘' },
                { time: '18:50-19:30', artist: '林潔心' },
                { time: '20:20-21:00', artist: 'EAERAN' },
            ]
        },
        '2024-05-19': {
            '赤聲舞台': [
                { time: '12:00-12:40', artist: '胡凱兒' },
                { time: '13:40-14:20', artist: '夜間限定' },
                { time: '15:20-16:00', artist: 'Billyrrom' },
                { time: '17:00-17:40', artist: '溫蒂漫步' },
                { time: '18:40-19:20', artist: 'MEAN' },
                { time: '20:20-21:00', artist: '怕胖團' },
            ],
            '躁動舞台': [
                { time: '12:45-13:25', artist: 'Limi' },
                { time: '14:20-15:00', artist: '庸俗救星' },
                { time: '16:00-16:40', artist: '南西肯恩' },
                { time: '17:40-18:20', artist: '莉莉周她說' },
                { time: '19:20-20:00', artist: 'DJ IKE' },
            ]
        }
    },
    // 5: 愛嶼搖滾 2024
    '5': {
        '2024-05-25': {
            '愛舞台': [
                { time: '13:20-14:00', artist: '胡凱兒' },
                { time: '14:50-15:30', artist: 'Multiverse' },
                { time: '16:20-17:00', artist: '粗大Band' },
                { time: '17:50-18:30', artist: '無妄合作社' },
                { time: '19:20-20:00', artist: '夜間限定' },
                { time: '20:50-21:30', artist: '高爾宣' },
            ],
            '嶼舞台': [
                { time: '14:00-14:40', artist: '宝島材料行' },
                { time: '15:30-16:10', artist: '林潔心' },
                { time: '17:00-17:40', artist: '農村武裝少年' },
                { time: '18:30-19:10', artist: '艾蜜莉' },
                { time: '20:00-20:40', artist: '福夢' },
            ]
        },
        '2024-05-26': {
            '愛舞台': [
                { time: '13:20-14:00', artist: '庸俗救星' },
                { time: '14:50-15:30', artist: '固定客' },
                { time: '16:20-17:00', artist: 'JADE' },
                { time: '17:50-18:30', artist: '溫蒂漫步' },
                { time: '19:20-20:00', artist: '怕胖團' },
                { time: '20:50-21:30', artist: '麋先生' },
            ],
            '嶼舞台': [
                { time: '14:00-14:40', artist: '就以斯' },
                { time: '15:30-16:10', artist: '眠氣' },
                { time: '17:00-17:40', artist: 'P!SCO' },
                { time: '18:30-19:10', artist: '南西肯恩' },
                { time: '20:00-20:40', artist: '公館青少年' },
            ]
        }
    },
    // 7: 臺秋祭 2024
    '7': {
        '2024-07-27': {
            '台秋舞台': [
                { time: '12:50-13:30', artist: '公館青少年' },
                { time: '14:30-15:10', artist: '胖虎' },
                { time: '16:10-16:50', artist: 'ANNALYNN' },
                { time: '17:50-18:30', artist: '芒果醬' },
                { time: '19:30-20:10', artist: '固定客' },
                { time: '21:10-21:50', artist: 'TRASH' },
            ],
            '唱秋舞台': [
                { time: '12:00-12:40', artist: '慶記KTV' },
                { time: '13:40-14:20', artist: '神使置 、激情の如 。' },
                { time: '15:20-16:00', artist: 'hue' },
                { time: '17:00-17:40', artist: 'tokyo honey trap' },
                { time: '18:40-19:20', artist: 'OBSESS' },
                { time: '20:20-21:00', artist: '玖壹壹' },
            ]
        },
        '2024-07-28': {
            '台秋舞台': [
                { time: '12:50-13:30', artist: 'JOYCE' },
                { time: '14:30-15:10', artist: 'SpecialThanks' },
                { time: '16:10-16:50', artist: '粗大Band' },
                { time: '17:50-18:30', artist: '溫室雜草' },
                { time: '19:30-20:10', artist: '傷心欲絕' },
                { time: '21:10-21:50', artist: '滅火器' },
            ],
            '唱秋舞台': [
                { time: '12:00-12:40', artist: '慶記KTV' },
                { time: '13:40-14:20', artist: '福夢' },
                { time: '15:20-16:00', artist: '胡凱兒' },
                { time: '17:00-17:40', artist: '老破麻' },
                { time: '18:40-19:20', artist: '夜の本気ダンス' },
                { time: '20:20-21:00', artist: '無妄合作社' },
            ]
        }
    },
    // 8: 濱海搖滾音樂祭 2024
    '8': {
        '2024-08-31': {
            '濱海舞台': [
                { time: '13:20-14:00', artist: '狗吠火車' },
                { time: '14:50-15:30', artist: '公館青少年' },
                { time: '16:00-16:30', artist: 'Ruka Banana' },
                { time: '17:15-18:00', artist: '月宵' },
                { time: '18:50-19:30', artist: 'P!SCO' },
                { time: '20:20-21:00', artist: '甜約翰' },
            ],
            '潮汐舞台': [
                { time: '14:00-14:50', artist: '獨流音樂' },
                { time: '16:30-17:15', artist: 'DJ月亮' },
                { time: '18:00-18:50', artist: 'DJ月亮' },
                { time: '19:30-20:20', artist: 'DJ月亮' },
            ]
        },
        '2024-09-01': {
            '濱海舞台': [
                { time: '13:20-14:00', artist: '沈默紳士' },
                { time: '14:50-15:30', artist: 'DIZLIKE' },
                { time: '16:00-16:30', artist: 'hue' },
                { time: '17:15-18:00', artist: '月宵' },
                { time: '18:50-19:30', artist: '胡凱兒' },
                { time: '20:20-21:00', artist: '隨性' },
            ],
            '潮汐舞台': [
                { time: '14:00-14:50', artist: 'HomeRich & Jimmy H.' },
                { time: '16:30-17:15', artist: 'Ani-mode' },
                { time: '18:00-18:50', artist: 'Ani-mode' },
                { time: '19:30-20:20', artist: 'Ani-mode' },
            ]
        }
    },
    // 13: 秋OUT 2024
    '13': {
        '2024-09-28': {
            '秋月': [
                { time: '14:00-14:40', artist: 'Amaiwana' },
                { time: '15:40-16:20', artist: 'Yangbans' },
                { time: '17:20-18:00', artist: 'OYAT' },
                { time: '19:00-20:00', artist: 'DJ KRUSH' },
                { time: '21:00-21:40', artist: 'Leo王船X幻術大仙' },
            ],
            '秋菊': [
                { time: '14:50-15:30', artist: 'Dac Band' },
                { time: '16:30-17:10', artist: 'COLD DEW' },
                { time: '18:10-18:50', artist: '我地希望' },
                { time: '20:10-20:50', artist: '心頭肉' },
            ]
        },
        '2024-09-29': {
            '秋月': [
                { time: '14:10-14:50', artist: '庵心自在所' },
                { time: '15:50-16:30', artist: '昏鴉' },
                { time: '17:30-18:10', artist: 'Alec Orachi' },
                { time: '19:10-19:50', artist: '蛋堡' },
                { time: '20:50-21:30', artist: 'YOUR SONG IS GOOD' },
            ],
            '秋菊': [
                { time: '15:00-15:40', artist: '河豚子' },
                { time: '16:40-17:20', artist: '畫室' },
                { time: '18:20-19:00', artist: '小本生燈' },
                { time: '20:10-20:50', artist: '海豚刑警' },
            ]
        }
    },
    // 14: 漂遊者 2024
    '14': {
        '2024-11-22': {
            '火炎山': [
                { time: '17:00', artist: 'TORO' },
                { time: '19:00', artist: 'hue' },
                { time: '21:00', artist: '拍謝少年' },
            ],
            '巴宰海': [
                { time: '16:00', artist: '公館青少年' },
                { time: '19:00', artist: '莉莉周她說' },
                { time: '20:00', artist: '粗大Band' },
            ]
        },
        '2024-11-23': {
            '火炎山': [
                { time: '13:00', artist: 'JOYCE' },
                { time: '15:00', artist: 'P!SCO' },
                { time: '17:00', artist: '芒果醬' },
                { time: '19:00', artist: '康士坦的變化球' },
                { time: '21:00', artist: '怕胖團' },
            ],
            '巴宰海': [
                { time: '12:00', artist: '老破麻' },
                { time: '14:00', artist: '福夢' },
                { time: '16:00', artist: '163braces' },
                { time: '18:00', artist: '鳳小岳' },
                { time: '20:00', artist: 'GEZAN' },
            ]
        },
        '2024-11-24': {
            '火炎山': [
                { time: '13:00', artist: 'POT' },
                { time: '15:00', artist: '傷心欲絕' },
                { time: '17:00', artist: '溫蒂漫步' },
                { time: '19:00', artist: '麋先生' },
                { time: '21:00', artist: '告五人' },
            ],
            '巴宰海': [
                { time: '12:00', artist: '冰球樂團' },
                { time: '14:00', artist: 'ENTH' },
                { time: '16:00', artist: 'culenasm' },
                { time: '18:00', artist: '董事長樂團' },
                { time: '20:00', artist: '傻子與白痴' },
            ]
        }
    },
    // 106: 春浪 2024
    '106': {
        '2024-11-02': {
            '晴空': [
                { time: '13:50-14:30', artist: '粹垢' },
                { time: '15:40-16:20', artist: '芒果醬' },
                { time: '17:30-18:10', artist: '麋先生' },
                { time: '19:20-20:00', artist: '告五人' },
                { time: '21:15-22:00', artist: '中島美嘉' },
            ],
            '山嵐': [
                { time: '13:00-13:40', artist: '絕命青年' },
                { time: '14:45-15:25', artist: '馬念先' },
                { time: '16:35-17:15', artist: 'cotoba' },
                { time: '18:25-19:05', artist: '法茲' },
                { time: '20:15-20:55', artist: '怕胖團' },
            ]
        },
        '2024-11-03': {
            '晴空': [
                { time: '13:40-14:20', artist: '我是機車少女' },
                { time: '15:20-16:00', artist: '椅子樂團' },
                { time: '17:10-17:50', artist: '大象體操' },
                { time: '19:00-19:40', artist: 'Creepy Nuts' },
                { time: '20:45-21:30', artist: '熱狗' },
            ],
            '山嵐': [
                { time: '13:00-13:40', artist: '荒山茉莉' },
                { time: '14:25-15:05', artist: 'LÜCY' },
                { time: '16:15-16:55', artist: 'KanSano' },
                { time: '18:05-18:45', artist: '夜間限定' },
                { time: '19:55-20:35', artist: '鄭宜農' },
            ]
        }
    },
    // 133: Emerge Fest 2026
    '133': {
        '2026-02-28': {
            '浮現舞台': [
                { time: '11:00-11:40', artist: '我是機車少女 I\'mdifficult' },
                { time: '12:40-13:20', artist: '芒果醬 MangoJump' },
                { time: '14:20-15:00', artist: '傻子與白痴' },
                { time: '16:00-16:40', artist: 'フレデリック（FREDERIC）' },
                { time: '17:40-18:20', artist: '滅火器 Fire EX.' },
                { time: '19:20-20:00', artist: '터치드(TOUCHED)' },
                { time: '21:00-21:40', artist: 'deca joins' },
            ],
            '光景舞台': [
                { time: '11:40-12:30', artist: 'yosugala' },
                { time: '13:30-14:10', artist: '庸俗救星' },
                { time: '15:10-15:50', artist: '粗大Band' },
                { time: '16:50-17:30', artist: 'Redoor' },
                { time: '18:30-19:10', artist: 'the cabs' },
                { time: '20:10-20:50', artist: 'JAUKIM' },
            ]
        },
        '2026-03-01': {
            '浮現舞台': [
                { time: '11:00-11:40', artist: 'VH' },
                { time: '12:40-13:20', artist: '拍謝少年 Sorry Youth' },
                { time: '14:20-15:00', artist: 'The Chairs 椅子樂團' },
                { time: '16:00-16:40', artist: 'go!go!vanillas' },
                { time: '17:40-18:20', artist: '怕胖團 PAPUN BAND' },
                { time: '19:20-20:00', artist: '糜先生 MIXER' },
                { time: '21:10-21:50', artist: '美秀集團' },
            ],
            '光景舞台': [
                { time: '11:50-12:30', artist: '旺福' },
                { time: '13:30-14:10', artist: 'CAN\'T BE BLUE' },
                { time: '15:10-15:50', artist: '溫室雜草' },
                { time: '16:50-17:30', artist: 'すりいTHREEE' },
                { time: '18:30-19:10', artist: 'Dragon Pony' },
                { time: '20:00-21:10', artist: '溫蒂漫步Wendy Wander x Billyrrom' },
            ]
        }
    },

    // 32: 漂遊者森林音樂節 2025
    '32': {
        '2025-12-12': {
            '火炎山': [
                { time: '17:00-17:40', artist: 'DYGL (JP)' },
                { time: '19:00-19:40', artist: '椅子樂團 The Chairs' },
                { time: '21:00-21:40', artist: '孫盛希 Shi Shi' },
            ],
            '巴宰海': [
                { time: '16:00-16:40', artist: 'Andr' },
                { time: '18:00-18:40', artist: 'hue' },
                { time: '20:00-20:40', artist: '南西肯恩 NeciKen' },
            ]
        },
        '2025-12-13': {
            '火炎山': [
                { time: '13:00-13:40', artist: 'Who Cares 胡凱兒' },
                { time: '15:00-15:50', artist: '富岡愛 TOMIOKA AI (JP)' },
                { time: '17:00-17:40', artist: 'JADE' },
                { time: '19:00-19:50', artist: 'Leo 王' },
                { time: '21:00-21:50', artist: 'TRASH' },
            ],
            '巴宰海': [
                { time: '12:00-12:40', artist: '上山 OVER THE TOP' },
                { time: '14:00-14:40', artist: '宋德鶴 Song of Crane' },
                { time: '16:00-16:40', artist: '無妄合作社 No-nonsense Collective' },
                { time: '18:00-18:40', artist: '溫蒂漫步 Wendy Wander' },
                { time: '20:00-20:40', artist: '四分衛 Quarterback ft. 張國璽 CHANG KUOSHI' },
            ]
        },
        '2025-12-14': {
            '火炎山': [
                { time: '13:00-13:40', artist: '震樂堂 Jhen Yue Tang' },
                { time: '15:00-15:50', artist: '回聲樂團 Echo of Your Soul' },
                { time: '17:00-17:40', artist: '甜約翰 Sweet John' },
                { time: '19:00-19:50', artist: '血肉果汁機 Flesh Juicer' },
                { time: '21:00-21:40', artist: '怕胖團 PAPUN BAND' },
            ],
            '巴宰海': [
                { time: '12:00-12:40', artist: '粗大Band Thick Big Band ft. Eland' },
                { time: '14:00-14:40', artist: 'icyball 冰球樂團' },
                { time: '16:00-16:40', artist: 'brkfstblend (JP)' },
                { time: '18:00-18:40', artist: '傻子與白痴 FOOL AND IDIOT ft. 163braces' },
                { time: '20:00-20:40', artist: '芒果醬 MangoJump' },
            ]
        }
    }
};

const festivalsData: Festival[] = [
  // 2026 Festivals
  { 
    id: '137', 
    name: '赤聲躁動 2026', 
    year: '2026', 
    dates: '2026/05/30-05/31', 
    location: '台中市立豐原體育場', 
    lineup: '(卡司待公布)', 
    kktix: 'https://s.klook.com/c/pXpPM5a2yW', 
    isFree: false, 
    transportation: '📍 活動資訊\n• 日期： 2026 年 5 月 30 日（六）至 5 月 31 日（日）\n• 地點： 台中市立豐原體育場\n• 地址： 台中市豐原區豐北街 221 號\n\n大眾運輸建議\n1. 台鐵（火車）轉公車：\n  - 搭乘至台鐵豐原火車站。\n  - 由前站出站後，可轉乘公車 12、700、235、813、211 等路線。\n  - 於「北環福德祠」站下車，步行約 10 分鐘即可抵達體育場。\n2. 捷運/高鐵轉乘：\n  - 高鐵：搭至高鐵台中站後，轉乘台鐵至「豐原火車站」，再依上述公車方式前往。\n  - 捷運：台中捷運目前無直接到達豐原，建議搭乘至捷運松竹站轉乘台鐵至豐原站。\n3. 步行（從火車站）：\n  - 從豐原火車站前站出發，步行距離約 1.8 公里，步行時間約需 20-25 分鐘。若天氣炎熱或攜帶行李，較建議搭乘公車。\n\n自行開車/騎車停車資訊\n• 體育場周邊：體育場設有一般及無障礙停車場。\n• 鄰近停車場：\n  - 豐原國民暨兒童運動中心：附設地下停車場（B1-B3 汽車位約 200 格，B1 機車位約 177 格），距離體育場非常近。\n  - 路邊停車：體育場周邊的豐北街、豐中路及豐裕路有路邊停車格。\n• 建議事項：由於音樂祭人潮眾多，體育場周邊停車位極易客滿，強烈建議利用大眾運輸工具前往，或將車輛停放在豐原火車站周邊的立體停車場再轉乘公車。', 
    lat: 24.2635, 
    lng: 120.7225 
  },
  { 
    id: '136', 
    name: '愛嶼搖滾 2026', 
    year: '2026', 
    dates: '2026/05/23-05/24', 
    location: '基隆國門廣場（基隆港西側，鄰近基隆火車站）', 
    lineup: '(卡司待公布)', 
    kktix: 'https://kktix.com/events/search?search=Love+Rock', 
    isFree: true, 
    transportation: '📍 活動地點\n• 地點：基隆國門廣場（基隆港西側，鄰近基隆火車站）\n• 地址：基隆市仁愛區港西街 6-2 號\n\n火車 (最推薦，步行最短)\n• 基隆火車站：搭乘台鐵至「基隆站」（終點站），由北站出口出站，過馬路後步行約 1 分鐘即可抵達國門廣場。這是全台交通最便利的音樂祭場地之一。\n• 注意：基隆站有南、北兩個出口，北站離舞台最近。\n\n客運與公車\n• 台北/新北出發：\n  - 國光客運 (1813、1815 等)：於台北車站或捷運站搭乘，直接在「基隆轉運站」下車，步行 2 分鐘即達。\n  - 2088 路 (快捷公車)：從捷運市府站出發，於「基隆女中」或「電力公司」下車，步行約 10 分鐘進入港邊。\n• 基隆市區公車：幾乎所有往基隆車站的路線皆可抵達。\n\n自行開車與停車\n由於場地位於基隆港交通樞紐，周邊車流量極大，建議優先利用收費停車場。\n• 基隆轉運站停車場：最鄰近會場的室內停車場。\n• 西三停車場：位於港西街，步行約 5 分鐘。\n• 東岸地下停車場：位於基隆港東側，停車後步行約 10-15 分鐘（可順便逛基隆廟口）。\n• 信二路停車場：步行距離約 15 分鐘。', 
    lat: 25.1325, 
    lng: 121.7394 
  },
  { id: '132', name: '台灣祭 2026', year: '2026', dates: '2026/04/03-04/05', location: '屏東墾丁大灣遊憩區', lineup: '滅火器Fire EX.、盧廣仲、周湯豪NICKTHEREAL、deca joins、怕胖團 PAPUN BAND、傻子與白痴、無妄合作社、ROTTENGRAFFTY (JP) 等', kktix: 'https://kktix.com/events/search?search=Taiwan+Music+Festival', isFree: true, transportation: '地點：屏東墾丁大灣遊憩區\n\n• 最推薦：搭高鐵至左營站，轉乘「9189 墾丁快線」直達墾丁。\n• 自駕管制：墾丁大街改為行人徒步區。南下車輛需於墾丁牌樓右轉改走「大灣路」；北上車輛由墾丁青年活動中心左轉大灣路。', lat: 21.9442, lng: 120.7977 },
  { id: '133', name: '浮現祭 2026', year: '2026', dates: '2026/02/28-03/01', location: '台中清水鰲峰山運動公園 / 台中市自由車場', lineup: 'フレデリック(JP)、go!go!vanillas(JP)、터치드(KR)、滅火器、美秀集團、拍謝少年、傻子與白痴、deca joins、芒果醬 等', kktix: 'https://kktix.com/events/search?search=EMERGE+FEST', isFree: false, isSoldOut: true, isEnded: true, transportation: '地點：台中清水鰲峰山運動公園 / 台中市自由車場\n\n官方接駁車 (需預約)：\n• 短程：清水市區 ⇄ 清水火車站 ⇄ 會場。\n• 中程：台中火車站、高鐵台中站、朝馬轉運站直達會場。\n• 長程：台北、桃園、台南、高雄定點發車。\n\n大眾運輸：\n• 台鐵：搭至「清水火車站」，轉乘官方短程接駁車或 688 路公車。\n• 高鐵：搭至「高鐵台中站」，轉乘官方中程接駁車。', lat: 24.2709, lng: 120.5804 },

  // 2025 Festivals
  { id: '31', name: '浮現祭 2025', year: '2025', dates: '2025/02/22-02/23', location: '台中清水鰲峰山運動公園', lineup: '麋先生、拍謝少年、老王樂隊、冰球樂團、溫蒂漫步、甜約翰、神聖かまってちゃん(JP) 等', kktix: 'https://kktix.com/events/search?search=EMERGE+FEST', isFree: false, isSoldOut: true, transportation: '核心交通：搭乘大眾運輸至台鐵清水站或台中市區，再轉乘官方接駁車。\n\n• 官方接駁車 (需預約)：強烈建議！包含長程 (台北、台中高鐵/台鐵、朝馬) 與短程 (清水站 ⇄ 清水市區 ⇄ 會場)。\n• 台鐵：清水站下車，轉乘接駁車、YouBike (約 15-20 分，有上坡) 或計程車 (約 5-10 分)。\n• 高鐵：台中站下車，轉乘官方中程接駁車，或至新烏日站搭台鐵至清水站。\n• 自行開車：導航至「鰲峰山運動公園」。建議停在官方合作的「嘉陽高中」免費停車場，再步行 15-20 分鐘上山。' },
  { id: '32', name: '漂遊者森林音樂節 2025', year: '2025', dates: '2025/12/12-12/14', location: '臺中麗寶樂園（東側落羽松草原）', lineup: 'TRASH、血肉果汁機、怕胖團、芒果醬、傻子與白痴、DYGL(JP)、富岡愛(JP) 等', kktix: 'https://kktix.com/events/search?search=Roving+Nation+Festival', isFree: false, isSoldOut: true, transportation: '地點：臺中麗寶樂園（東側落羽松草原）\n\n大眾運輸與接駁車：\n1. 免費接駁車（麗寶專線）：\n• 後裡國小站 ⇄ 麗寶樂園（近後裡火車站，步行約5分鐘）。\n• 臺中朝馬轉運站 ⇄ 麗寶奧特萊斯購物中心（國光客運6號月臺）。\n• 提醒：部分路線需提前預約，請關注官網公告。\n2. 市區公車：乘坐 155、215、811、92 路至「麗寶樂園」站。\n\n自駕/騎車 (會場內禁止停車):\n• 汽車：停在麗寶奧特萊斯二期停車場（城市車旅），步行5-7分鐘達會場。當日最高200元。\n• 機車：麗寶園區機車停車場，一次50元。\n• 露營者：建議先在停車場卸裝備，由工作人員指引或遊園車協助搬運。\n\n火車/高鐵轉乘：\n• 火車：搭至後裡火車站，步行至「後裡國小」乘免費接駁車。\n• 高鐵：搭至高鐵臺中站，轉乘155路公車直達，或乘臺鐵區間車至後裡站再轉接駁車。' },
  { id: '16', name: '大港開唱 2025', year: '2025', dates: '2025/03/29-03/30', location: '高雄駁二藝術特區 (大義、蓬萊、海音中心)', lineup: 'The Flaming Lips(US)、QURULI(JP)、閃靈、美秀集團、傷心欲絕 等', kktix: 'https://kktix.com/events/search?search=Megaport', isFree: false, isSoldOut: true, isEnded: true, transportation: '核心交通：搭乘高雄捷運或輕軌，方便快速且不受交通管制影響。\n\n• 捷運：橘線 O2 鹽埕埔站 1 號出口，步行 5-8 分鐘。\n• 輕軌：C12 駁二大義站 或 C11 真愛碼頭站 下車直達。\n• 高鐵/台鐵：搭至左營或高雄站轉乘捷運紅線，至美麗島站轉橘線。\n• 自行開車：完全不建議。周邊道路狹窄且實施管制，停車位一位難求。', lat: 22.6198, lng: 120.2818 },
  { id: '17', name: '台灣祭 2025', year: '2025', dates: '2025/04/03-04/05', location: '屏東墾丁大灣遊憩區', lineup: '血肉果汁機、TRASH、美秀集團、宇宙人、滅火器、傻子與白痴、KNOCK OUT MONKEY(JP)、DOES(JP)等', kktix: 'https://kktix.com/events/search?search=Taiwan+Music+Festival', isFree: true, isEnded: true, transportation: '地點：屏東墾丁大灣遊憩區\n\n• 最推薦：搭高鐵至左營站，轉乘「9189 墾丁快線」直達墾丁。\n• 自駕管制：墾丁大街改為行人徒步區。南下車輛需於墾丁牌樓右轉改走「大灣路」；北上車輛由墾丁青年活動中心左轉大灣路。' },
  { id: '18', name: '野人祭 2025', year: '2025', dates: '2025/04/26-04/27', location: '台北華中露營場 (萬大路底)', lineup: '蛋堡、Hello Nico、Beach Fossils(US)、Phum Viphurit(TH)、無妄合作社、那我懂你意思了 等', kktix: 'https://kktix.com/events/search?search=Savage+Festival', isFree: false, isSoldOut: true, transportation: '地點：台北華中露營場 (萬大路底)\n\n• 公車：搭乘 12、307、601、204 路至「華中河濱公園站」下車，穿過華中二水門即達。\n• 自駕：附近設有華中橋堤外平面停車場可供停放。' },
  { id: '19', name: '赤聲躁動 2025', year: '2025', dates: '2025/05/17-05/18', location: '烏日啤酒觀光工廠', lineup: 'SIX LOUNGE(JP)、川西奈月(JP)等+國際音樂交流媒合', kktix: 'https://kktix.com/events/search?search=Carnival+Fever', isFree: false, isSoldOut: true, transportation: '地點：烏日啤酒觀光工廠\n\n• 台鐵：搭乘至「烏日火車站」，出站步行約 5-8 分鐘即達。\n• 高鐵：搭至高鐵台中站，轉乘台鐵至「烏日站」(僅 1 站) 或搭計程車 (約 5 分鐘)。\n• 捷運：搭至綠線「九德站」，步行約 12-15 分鐘 (較不推薦，火車更近)。\n• 停車：廠內有車位但易滿，建議尋找光華街周邊路邊停車。' },
  { id: '20', name: '愛嶼搖滾音樂祭 2025', year: '2025', dates: '2025/05/24-05/25', location: '基隆國門廣場', lineup: '宇宙人、怕胖團、傻子與白痴、甜約翰等(42組)', kktix: 'https://kktix.com/events/search?search=Love+Rock', isFree: true, isEnded: true, transportation: '地點：基隆國門廣場\n\n• 火車：搭乘至「基隆火車站」，由北站出口出站，步行 1 分鐘即達。交通全台最方便！' },
  { id: '21', name: '臺秋祭 2025', year: '2025', dates: '2025/07/12-07/13', location: '台中驛鐵道文化園區 (舊台中車站)', lineup: 'KUZIRA(JP)、KNOCK OUT MONKEY(JP)、美秀集團、拍謝少年、怕胖團、血肉果汁機、國蛋、傻子與白痴、福夢等', kktix: 'https://kktix.com/events/search?search=Taichill+City', isFree: false, isSoldOut: true, transportation: '地點：台中驛鐵道文化園區 (舊台中車站)\n\n• 大眾運輸 (唯一推薦)：搭乘台鐵至「台中火車站」，出站步行 1 分鐘即達會場入口。\n• 高鐵：搭至高鐵台中站，轉乘台鐵北上火車 (約 10-15 分鐘) 至「台中火車站」。\n• 停車：建議停放於「台中車站地下停車場」或「大魯閣新時代購物中心」，但假日極易客滿。' },
  { id: '23', name: '濱海搖滾音樂祭 2025', year: '2025', dates: '2025/08/23-08/24', location: 'MITSUI OUTLET PARK 台中港', lineup: '芒果醬、公館青少年、粗大Band、上山、福夢、icyball 等', kktix: 'https://kktix.com/events/search?search=Oursea', isFree: false, isSoldOut: true, transportation: '地點：MITSUI OUTLET PARK 台中港\n\n• 快捷公車：從台中火車站或朝馬搭乘 308、310 路直達「台中港旅客服務中心」。\n• 捷運轉乘：搭乘捷運至「市政府站」轉乘 310 路公車。\n• 高鐵：台中站搭乘 161 路至「榮總/東海大學」轉乘 308 或 310 路.' },
  { id: '24', name: '浪人祭 2025', year: '2025', dates: '2025/10/17-10/19', location: '台南安平觀夕平台旁大草皮', lineup: '落日飛車、Deca Joins、傷心欲絕、椅子樂團 等', kktix: 'https://kktix.com/events/search?search=Lo-Fi+Festival', isFree: false, isSoldOut: true, transportation: '核心交通：搭乘大眾運輸至台南市區後，轉乘官方接駁車或市區公車。\n\n• 官方接駁/共乘 (需預約)：最推薦方式。包含長途共乘 (北中桃直達) 與短程接駁 (火車站/高鐵站往返)，詳見官方公告。\n• 高鐵/台鐵：抵達台南站後，轉乘 2 號公車至「白鷺灣社區」或 99 號觀光公車至「觀夕平台」。\n• 自行開車：導航至「安平觀夕平台」。周邊停車位有限，建議提早抵達或停在市區轉乘。' },
  { id: '25', name: '桃園鐵玫瑰音樂節 2025', year: '2025', dates: '2025/10/04-10/05', location: '桃園 陽光劇場', lineup: '鼓鼓feat.白安、高爾宣OSN、血肉果汁機、沉默紳士、梁河懸 等', kktix: 'https://kktix.com/events/search?search=桃園鐵玫瑰音樂節', isFree: true, isEnded: true, transportation: '地點：桃園陽光劇場\n\n• 機場捷運：A17 領航站 1 號出口，步行約 3 分鐘即達。\n• 停車：場地備有 B1 地下停車場 (約 260 格，限高 2.1m)。' },
  { id: '26', name: '搖滾台中 2025', year: '2025', dates: '2025/10/11-10/12', location: '台中文心森林公園', lineup: 'HUSH、美秀集團、老王樂隊、溫室雜草、溫蒂漫步等', kktix: 'https://kktix.com/events/search?search=Rock+in+Taichung', isFree: true, isEnded: true, transportation: '地點：台中文心森林公園\n\n• 台中捷運：「文心森林公園站」下車，1 號出口即達。\n• 公車：可搭乘 73、83、365、綠 2、綠 3 至捷運站下車。' },
  { id: '27', name: '春浪音樂節 2025', year: '2025', dates: '2025/10/31-11/02', location: '台中 森渼原 Alive Glamping', lineup: '蘇打綠、張震嶽、馬思唯、SUGIZO(JP)、SPYAIR(JP)、美秀集團、宇宙人、Phum Viphurit(TH) 等', kktix: 'https://s.klook.com/c/930nO4xZyV', isFree: false, isSoldOut: true, transportation: '地點：台中 森渼原\n\n• 接駁車：會場位於山上，強烈建議預約官方「台中高鐵站 ⇄ 會場」接駁車。\n• 自駕：需事先購買「汽車停車證」方可入場停車，現場無證無法停放。' },
  { id: '28', name: '秋OUT 2025', year: '2025', dates: '2025/10/11-10/12', location: '台北公館自來水園區 / 水源路', lineup: 'JADE、VOOID、Green! Eyes、百合花、我是機車少女、LINION、淺堤 Shallow Levée、DSPS', kktix: 'https://pipelivemusic.kktix.cc/events/chillout2025-a01', isFree: false, isSoldOut: true, transportation: '地點：台北公館自來水園區 / 水源路\n\n• 捷運：公館站 4 號出口，往思源街步行約 5 分鐘即達。\n• 注意：現場完全無機車停車格，強烈不建議騎車前往。' },
  { id: '29', name: '火球祭 2025', year: '2025', dates: '2025/11/22-11/23', location: '桃園樂天棒球場', lineup: '滅火器 Fire EX.、玖壹壹、美秀集團、血肉果汁機、拍謝少年、MATZKA、無妄合作社、隨性 Random ft. SKARAOKE、鳳小岳 & 壓克力柿子', kktix: 'https://tixcraft.com/activity/detail/25_fireball', isFree: false, isSoldOut: true, transportation: '核心交通：搭乘大眾運輸至高鐵桃園站或機捷 A19 站。強烈不建議開車。\n\n• 高鐵：桃園站下車，步行約 10-15 分鐘 or 轉乘機捷至 A19 站。\n• 機捷：A19 桃園體育園區站 1 號出口，出站即達會場。\n• 台鐵：中壢車站轉乘公車 (170、5081等) 至高鐵桃園站，或至機捷 A21 環北站轉乘。\n• 自行開車：國道二號大竹交流道往青埔。周邊實施交通管制且停車位極少，極度不建議。' },
  { id: '30', name: '簡單生活節 2025', year: '2025', dates: '2025/11/29-11/30', location: '台北華山 1914 文化創意產業園區', lineup: '伍佰& China Blue feat. 李宗盛、林憶蓮、戴佩妮、楊乃文、理想混蛋、黃宣等', kktix: 'https://streetvoicetw.kktix.cc/events/b2b4e11f', isFree: false, isSoldOut: true, transportation: '地點：台北華山 1914 文化創意產業園區\n\n• 捷運 (最推薦)：忠孝新生站 1 號出口 (步行 3 分) 或 善導寺站 6 號出口 (步行 5 分)。\n• 公車：搭乘至「華山文創園區站」或「忠孝國小站」。\n• 停車：園區停車場位子有限且易滿，建議停放於鄰近的「三創生活園區」或「光華新天地」。\n• 火車/高鐵：搭至台北車站，轉捷運板南線往南港方向搭 1-2 站即達。' },
  // 2024 Festivals
  { id: '1', name: '浮現祭 2024', year: '2024', dates: '2024/02/24-02/25', location: '台中清水鰲峰山運動公園', lineup: '麋先生、拍謝少年、老王樂隊、冰球樂團、溫蒂漫步、甜約翰、神聖かまってちゃん(JP) 等', kktix: 'https://kktix.com/events/search?search=EMERGE+FEST', isFree: false, isSoldOut: true, transportation: '地點：台中市自由車場 (鰲海路 70 號)\n\n• 官方接駁車 (最推薦)：包含台中火車站線、清水火車站線、朝馬轉運站線。\n• 台鐵：清水站轉乘接駁車或 688 路公車；台中站轉乘接駁車或 303、304、305 路公車。\n• 高鐵：台中站轉乘 93 路公車至「中山董公街口」站下車。\n• 自行開車：建議停放於「嘉陽高中」免費停車場，步行約 8 分鐘抵達會場。不建議直接開入山區。' },
  { id: '2', name: '大港開唱 2024', year: '2024', dates: '2024/03/30-03/31', location: '高雄駁二藝術特區 (大義、蓬萊、海音中心)', lineup: 'ASIAN KUNG-FU GENERATION(JP)、Maximum The Hormone(JP)、Avantgardey(JP)、草東沒有派對、滅火器、拍謝少年、閃靈、Tizzy Bac、李權哲、康士坦的變化球 等', kktix: 'https://kktix.com/events/search?search=Megaport', isFree: false, isSoldOut: true, isEnded: true, transportation: '• 捷運：橘線 O2 鹽埕埔站 1 號出口，步行 5-8 分鐘。\n• 輕軌：C12 駁二大義站 或 C11 真愛碼頭站 下車直達。\n• 高鐵/台鐵：搭至左營或高雄站轉乘捷運紅線，至美麗島站轉橘線。', lat: 22.6198, lng: 120.2818 },
  { id: '3', name: '台灣祭 2024', year: '2024', dates: '2024/04/04-04/06', location: '屏東墾丁大灣遊憩區', lineup: '滅火器、美秀集團、玖壹壹、TRASH 等', kktix: 'https://kktix.com/events/search?search=Taiwan+Music+Festival', isFree: true, isEnded: true, transportation: '• 最推薦：搭高鐵至左營站，轉乘「9189 墾丁快線」直達墾丁。\n• 自駕管制：墾丁大街改為行人徒步區。南下車輛需於墾丁牌樓右轉改走「大灣路」；北上車輛由墾丁青年活動中心左轉大灣路。' },
  { id: '4', name: '赤聲躁動 2024', year: '2024', dates: '2024/05/18-05/19', location: '烏日啤酒觀光工廠', lineup: '54組藝人,主題『大膽純愛 Y2K』', kktix: 'https://kktix.com/events/search?search=Carnival+Fever', isFree: false, isSoldOut: true, transportation: '地點：烏日啤酒觀光工廠\n\n• 台鐵：搭乘至「烏日火車站」，出站步行約 5-8 分鐘即達。\n• 高鐵：搭至高鐵台中站，轉乘台鐵至「烏日站」(僅 1 站) 或搭計程車 (約 5 分鐘)。\n• 捷運：搭至綠線「九德站」，步行約 12-15 分鐘 (較不推薦，火車更近)。\n• 停車：廠內有車位 but 易滿，建議尋找光華街周邊路邊停車。' },
  { id: '5', name: '愛嶼搖滾音樂祭 2024', year: '2024', dates: '2024/05/25-05/26', location: '基隆國門廣場', lineup: '高爾宣、麋先生、無妄合作社、粗大Band 等', kktix: 'https://kktix.com/events/search?search=Love+Rock', isFree: true, isEnded: true, transportation: '地點：基隆國門廣場\n\n• 火車：搭乘至「基隆火車站」，由北站出口出站，步行 1 分鐘即達。交通全台最方便！' },
  { id: '7', name: '臺秋祭 2024', year: '2024', dates: '2024/07/27-07/28', location: '台中驛鐵道文化園區 (舊台中車站)', lineup: 'SpecialThanks(JP)、福夢FUMON、粗大Band、西屯純愛組、BG8LOCC 等', kktix: 'https://kktix.com/events/search?search=Taichill+City', isFree: false, isSoldOut: true, transportation: '地點：台中驛鐵道文化園區 (舊台中車站)\n\n• 大眾運輸 (唯一推薦)：搭乘台鐵至「台中火車站」，出站步行 1 分鐘即達會場入口。\n• 高鐵：搭至高鐵台中站，轉乘台鐵北上火車 (約 10-15 分鐘) 至「台中火車站」。\n• 停車：建議停放於「台中車站地下停車場」或「大魯閣新時代購物中心」，但假日極易客滿。' },
  { id: '8', name: '濱海搖滾音樂祭 2024', year: '2024', dates: '2024/08/31-09/01', location: 'MITSUI OUTLET PARK 台中港', lineup: '甜約翰、P!SCO、狗吠火車、公館青少年 等', kktix: 'https://kktix.com/events/search?search=Oursea', isFree: false, isSoldOut: true, transportation: '地點：MITSUI OUTLET PARK 台中港\n\n• 快捷公車：從台中火車站或朝馬搭乘 308、310 路直達「台中港旅客服務中心」。\n• 捷運轉乘：搭乘捷運至「市政府站」轉乘 310 路公車。\n• 高鐵：台中站搭乘 161 路至「榮總/東海大學」轉乘 308 或 310 路。' },
  { id: '9', name: '浪人祭 2024', year: '2024', dates: '2024/10/05-10/06', location: '台南安平觀夕平台旁大草皮', lineup: '落日飛車、Deca Joins、YELLO W、血肉果汁機 等', kktix: 'https://vagabondfest.kktix.cc/events/2024', isFree: false, isSoldOut: true, transportation: '地點：台南安平觀夕平台旁大草皮\n\n• 官方接駁：提供「台南火車站 ⇄ 會場」及「高鐵台南站」預約制直達接駁車。\n• 長途接駁：2024 提供台北、桃園、台中出發的付費長途共乘包車。\n• 市區公車：搭乘 2 路、19 路公車至「觀夕平台」站下車。' },
  { id: '10', name: '桃園鐵玫瑰音樂節 2024', year: '2024', dates: '2024/10/05-10/06', location: '桃園 陽光劇場', lineup: '宇宙人、拍謝少年、溫蒂漫步、熊仔、Ozone 等', kktix: 'https://kktix.com/events/search?search=桃園鐵玫瑰音樂節', isFree: true, isEnded: true, transportation: '地點：桃園陽光劇場 (桃園市大園區領航北路四段 216 號)\n\n機場捷運 (最推薦)：\n• A17 領航站：出站後步行約 3 分鐘即抵達。僅「普通車」停靠，直達車不停靠。\n\n高鐵轉乘：\n• 搭至「高鐵桃園站」，轉乘機場捷運 (往台北方向) 1 站至 A17 領航站，或搭計程車 (約 5-8 分鐘)。\n\n市區公車：\n• 搭乘 206、206A、302、707、L509、5087、5087A、5089 至「捷運領航站 (A17)」下車。\n\n自行開車與停車：\n• 陽光劇場地下停車場：由領航北路四段進入 (位子有限)。\n• 高鐵站周邊停車場：停放後轉乘機場捷運至 A17 站。\n\n機車停車：\n• 陽光劇場 B1 設有機車停車場，或依現場指示停放於臨時區域。' },
  { id: '11', name: '打狗祭 2024', year: '2024', dates: '2024/10/12-10/13', location: '高雄流行音樂中心 (高流)', lineup: 'HUSH、萬芳、戴佩妮、宇宙人、TRASH、FLOW、氣志團(JP)、血肉果汁機 等', kktix: 'https://takaorock.kktix.cc/events/2024takaorock', isFree: false, isSoldOut: true, transportation: '地點：高雄流行音樂中心 (高流)\n\n• 輕軌：最方便，於「C11 真愛碼頭站」下車即達。\n• 捷運：橘線「O2 鹽埕埔站」4 號出口，步行約 10 分鐘。' },
  { id: '12', name: '搖滾台中 2024', year: '2024', dates: '2024/10/26-10/27', location: '台中文心森林公園', lineup: 'TRASH、芒果醬、血肉果汁機、傻子與白痴、溫蒂漫步、新東京(JP)等', kktix: 'https://kktix.com/events/search?search=Rock+in+Taichung', isFree: true, isEnded: true, transportation: '地點：台中文心森林公園\n\n• 台中捷運：「文心森林公園站」下車，1 號出口即達。\n• 公車：可搭乘 73、83、365、綠 2、綠 3 至捷運站下車。' },
  { id: '13', name: '秋OUT 2024', year: '2024', dates: '2024/09/28-09/29', location: '台北公館自來水園區 / 水源路', lineup: '怕胖團、芒果醬、傻子與白痴、血肉果汁機 等', kktix: 'https://autumnout.kktix.cc/events/autumnout24', isFree: false, isSoldOut: true, transportation: '地點：台北公館自來水園區 / 水源路\n\n• 捷運：公館站 4 號出口，往思源街步行約 5 分鐘即達。\n• 注意：現場完全無機車停車格，強烈不建議騎車前往。' },
  { id: '14', name: '漂遊者森林音樂祭 2024', year: '2024', dates: '2024/11/22-11/24', location: '台中麗寶樂園東區大草皮', lineup: '三日音樂+市集(多舞台)', kktix: 'https://rovingnation.kktix.cc/events/rovingnation24', isFree: false, isSoldOut: true, transportation: '地點：台中麗寶樂園東區大草皮\n\n• 免費接駁：可利用麗寶樂園提供的「后里火車站 ⇄ 麗寶樂園」或「朝馬轉運站 ⇄ 麗寶」接駁專車。\n• 自駕：由國道 1 號后里交流道下，往麗寶樂園方向行駛即可抵達。' },
  { id: '15', name: '火球祭 2024', year: '2024', dates: '2024/11/30-12/01', location: '桃園樂天桃園棒球場', lineup: '滅火器、ACIDMAN(JP)、MONGOL800(JP)、大象體操、血肉果汁機、Dune Rats(AU)等', kktix: 'https://fireball.kktix.cc/events/fireballfest24', isFree: false, isSoldOut: true, transportation: '地點：桃園樂天桃園棒球場\n\n• 機場捷運：搭乘至 A19 桃園體育園區站下車，出站即達會場。\n• 高鐵：桃園站下車，轉乘機場捷運往中壢方向搭乘 1 站 (約 3 分鐘)。' },
  { id: '106', name: '春浪音樂節 2024', year: '2024', dates: '2024/11/02-11/03', location: '台中 森渼原', lineup: '中島美嘉(JP)、告五人、麋先生、芒果醬、熱狗、Creepy Nuts(JP) 等', kktix: 'https://www.klook.com/zh-TW/activity/101021430', isFree: false, isSoldOut: true, transportation: '地點：台中 森渼原\n\n• 接駁車：會場位於山上，官方建議預約「台中高鐵站 ⇄ 會場」接駁車。\n• 自駕：需購買「汽車停車證」方可入場，無證者無法停放。' },
];

const announcementsData: Announcement[] = [
    {
        id: '1',
        festivalName: '火球祭',
        title: '【緊急】主舞台延遲15分鐘開演',
        content: '因技術問題，主舞台 Fire Stage 目前的節目將延遲15分鐘開始。請樂迷朋友們稍作等候，不便之處，敬請見諒。',
        timestamp: '5 分鐘前',
        author: '大會官方',
        authorInitials: '官',
    },
    {
        id: '2',
        festivalName: '大港開唱',
        title: '【周邊】限定毛巾緊急補貨！',
        content: '大會報告！詢問度超高的大港限定毛巾已於周邊攤位緊急補貨上架，數量有限，上次沒買到的朋友請把握機會！',
        timestamp: '30 分鐘前',
        author: '周邊組',
        authorInitials: '周',
    },
    {
        id: '3',
        festivalName: '浪人祭',
        title: '【天氣】午後雷陣雨提醒',
        content: '氣象預報顯示，下午3點後可能會有局部雷陣雨。請大家記得攜帶雨具，並注意電子設備防水。場地若有積水請小心行走。',
        timestamp: '1 小時前',
        author: '安全組',
        authorInitials: '安',
    },
     {
        id: '4',
        festivalName: '火球祭',
        title: '【失物】尋獲銀色手環一隻',
        content: '服務台拾獲一只銀色手環，遺失的物主請至主舞台旁的服務台認領。',
        timestamp: '2 小時前',
        author: '服務台',
        authorInitials: '服',
    },
    {
        id: '5',
        festivalName: '浮現祭',
        title: '【交通】接駁車最後班次提醒',
        content: '今日往台中火車站的最後一班接駁車將於 22:30 準時發車，請有需要的樂迷朋友提早前往接駁站排隊。',
        timestamp: '15 分鐘前',
        author: '交通組',
        authorInitials: '交',
    },
    {
        id: '6',
        festivalName: '台灣祭',
        title: '【美食】美食區限定飲品買一送一',
        content: '歡慶台灣祭最後一天！美食區 A1 攤位「墾丁特調」即刻起至 18:00 享買一送一優惠，數量有限售完為止。',
        timestamp: '45 分鐘前',
        author: '餐飲組',
        authorInitials: '餐',
    },
    {
        id: '7',
        festivalName: '赤聲躁動',
        title: '【簽名會】滅火器簽名會時間異動',
        content: '原定 15:30 於周邊區進行的滅火器簽名會，因行程調整將改至 16:00 開始，請持有號碼牌的朋友留意。',
        timestamp: '1 小時前',
        author: '活動組',
        authorInitials: '活',
    },
    {
        id: '8',
        festivalName: '春浪音樂節',
        title: '【環保】回收空瓶兌換限定貼紙',
        content: '愛地球！凡收集 5 個大會指定飲品空瓶至環保攤位，即可兌換春浪限定雷射貼紙一張，每人限換一次。',
        timestamp: '3 小時前',
        author: '環保組',
        authorInitials: '環',
    },
    {
        id: '9',
        festivalName: '大港開唱',
        title: '【舞台】海龍王舞台人潮管制中',
        content: '目前海龍王舞台區人潮已達上限，大會已啟動進場管制。建議樂迷朋友們可先前往南壩天舞台欣賞演出。',
        timestamp: '10 分鐘前',
        author: '安全組',
        authorInitials: '安',
    },
];

// Helper to manually parse date string "YYYY/MM/DD" or "YYYY/MM/DD-DD" to avoid timezone issues
const parseDateString = (dateStr: string, fallbackYear?: number) => {
    // Handle "MM/DD" format if fallbackYear is provided
    if (fallbackYear && !dateStr.includes('/')) {
        // Just DD
        return new Date(fallbackYear, new Date().getMonth(), parseInt(dateStr)); // Very rough fallback
    }

    if (!dateStr.includes('/')) return new Date(); // Invalid

    const parts = dateStr.split('/');
    if (parts.length === 3) {
        // YYYY/MM/DD
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1; // Month is 0-indexed
        const d = parseInt(parts[2], 10);
        return new Date(y, m, d);
    } else if (parts.length === 2 && fallbackYear) {
         // MM/DD with fallback year
        const m = parseInt(parts[0], 10) - 1;
        const d = parseInt(parts[1], 10);
        return new Date(fallbackYear, m, d);
    }
    
    return new Date(dateStr); // Fallback to browser parsing
};

// Helper function to parse date ranges from festival data
const parseDateRange = (festival: Festival): { start: Date; end: Date } => {
    const { dates } = festival;
    
    // Format is typically YYYY/MM/DD-MM/DD or YYYY/MM/DD-DD or just YYYY/MM/DD
    const rangeParts = dates.split('-');
    const startStr = rangeParts[0];
    const endStr = rangeParts.length > 1 ? rangeParts[1] : startStr;
    
    const startDate = parseDateString(startStr);
    const startYear = startDate.getFullYear();

    let endDate;
    if (endStr === startStr) {
        endDate = new Date(startDate);
    } else {
        if (endStr.includes('/')) {
            // MM/DD
            endDate = parseDateString(endStr, startYear);
        } else {
            // Just DD
            const m = startDate.getMonth(); // 0-indexed
            const d = parseInt(endStr, 10);
            endDate = new Date(startYear, m, d);
        }
    }
    
    // Handle year rollover (e.g. Dec -> Jan)
    if (endDate < startDate) {
        endDate.setFullYear(endDate.getFullYear() + 1);
    }
    
    // Set hours to ensure full day coverage
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    return { start: startDate, end: endDate };
};

// Helper function to format the date range for display
const formatDateForDisplay = (festival: Festival): string => {
    const { start, end } = parseDateRange(festival);
    
    // Check for invalid dates from parsing
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return festival.dates; // Fallback to original string
    }

    const startYear = start.getFullYear();
    const startMonth = start.getMonth() + 1;
    const startDay = start.getDate();

    const endYear = end.getFullYear();
    const endMonth = end.getMonth() + 1;
    const endDay = end.getDate();

    const isSingleDay = (start.toDateString() === end.toDateString());

    if (isSingleDay) {
        return `${startYear}年${startMonth}月${startDay}日`;
    }
    
    if (startYear === endYear) {
        if (startMonth === endMonth) {
            return `${startYear}年${startMonth}月${startDay}日 - ${endDay}日`;
        } else {
            return `${startYear}年${startMonth}月${startDay}日 - ${endMonth}月${endDay}日`;
        }
    } else {
        return `${startYear}年${startMonth}月${startDay}日 - ${endYear}年${endMonth}月${endDay}日`;
    }
};

const getDateKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const WelcomeScreen: React.FC<{ onWelcome: () => void }> = ({ onWelcome }) => (
    <div className="screen welcome-screen">
        <h1 className="logo">拾音旅伴</h1>
        <button className="welcome-button" onClick={onWelcome}>Welcome</button>
    </div>
);

const AuthScreen: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
    const [isLogin, setIsLogin] = useState(true);

    return (
        <div className="screen auth-screen">
            <div className="auth-form">
                {isLogin ? (
                    <>
                        <h2>登入</h2>
                        <p>Sign in to your account</p>
                        <input type="email" placeholder="Email" />
                        <input type="password" placeholder="Password" />
                        <button className="primary-button" onClick={onLogin}>登入</button>
                        <a className="toggle-link" onClick={() => setIsLogin(false)}>沒有帳號？ 註冊</a>
                    </>
                ) : (
                    <>
                        <h2>註冊</h2>
                        <p>Sign Up</p>
                        <input type="text" placeholder="Name" />
                        <input type="email" placeholder="Email" />
                        <input type="password" placeholder="Password" />
                        <button className="primary-button" onClick={onLogin}>註冊</button>
                        <a className="toggle-link" onClick={() => setIsLogin(true)}>有過帳號？ 登入</a>
                    </>
                )}
                <button className="secondary-button">Continue with Google</button>
                <button className="secondary-button">Continue with Apple</button>
            </div>
        </div>
    );
};

const ApiKeyScreen: React.FC<{ onKeySaved: (key: string) => void }> = ({ onKeySaved }) => {
    const [key, setKey] = useState('');

    const handleSave = () => {
        if (key.trim()) {
            onKeySaved(key.trim());
        } else {
            alert('請輸入有效的 API 金鑰');
        }
    };

    return (
        <div className="screen api-key-screen">
            <div className="api-key-form-wrapper">
                <h2>啟用 Google Maps</h2>
                <p>
                    請輸入您的 Google Maps API 金鑰以啟用「即時位置」功能。金鑰將會安全地儲存在您的瀏覽器中，不會被傳送到任何伺服器。
                </p>
                <div className="api-key-form-inner">
                    <input 
                        type="password" 
                        placeholder="在此貼上您的 API 金鑰" 
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        className="form-input"
                    />
                    <button onClick={handleSave} className="form-submit-btn">儲存並繼續</button>
                </div>
            </div>
        </div>
    );
};


const Modal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    headerContent?: React.ReactNode;
    title?: string;
    fullscreen?: boolean;
    className?: string;
}> = ({ isOpen, onClose, children, headerContent, title, fullscreen = false, className = '' }) => {
    if (!isOpen) return null;

    const overlayClasses = `modal-overlay`;
    const contentClasses = `modal-content ${fullscreen ? 'fullscreen' : ''} ${className}`;

    return (
        <div className={overlayClasses} onClick={onClose}>
            <div className={contentClasses} onClick={(e) => e.stopPropagation()}>
                {headerContent ? headerContent : (
                    <header className="modal-header">
                         <div className="modal-header-placeholder left"></div>
                        <h2 className="modal-title">{title}</h2>
                        <button onClick={onClose} className="modal-close-button">&times;</button>
                    </header>
                )}
                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>
    );
};


const getFestivalColor = (name: string) => {
    const n = name.toLowerCase();
    
    // 北部 - 紅色
    if (n.includes('火球') || n.includes('春浪') || n.includes('卡卡') || 
        n.includes('野人') || n.includes('愛嶼') || n.includes('鐵玫瑰') || 
        n.includes('秋out') || n.includes('簡單生活')) {
        return '#c15130'; // Red
    }
    
    // 中部 - 藍色
    if (n.includes('搖滾台中') || n.includes('浮現') || n.includes('赤聲躁動') || 
        n.includes('臺秋') || n.includes('濱海') || n.includes('漂遊者')) {
        return '#43607D'; // Blue
    }
    
    // 南部 - 綠色
    if (n.includes('大港') || n.includes('浪人') || n.includes('台灣祭') || n.includes('打狗')) {
        return '#5D806A'; // Green
    }
    
    return 'var(--accent-primary)';
};

const AnnouncementItem: React.FC<{ festivalName: string, title: string, content: string, timestamp: string }> = ({ festivalName, title, content, timestamp }) => {
    const isUrgent = title.includes('緊急') || title.includes('重要') || title.includes('管制');
    const isTraffic = title.includes('交通') || title.includes('接駁');
    
    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`announcement-card-v2 ${isUrgent ? 'urgent' : ''}`}
        >
            <div className="announcement-card-header">
                <div className="announcement-type-icon">
                    {isUrgent ? (
                        <AlertTriangle size={16} className="text-[#c15130]" />
                    ) : isTraffic ? (
                        <Bus size={16} className="text-blue-500" />
                    ) : (
                        <Bell size={16} className="text-amber-500" />
                    )}
                </div>
            </div>
            
            <div className="announcement-body-v2">
                <h4 className="announcement-title-v2">{title}</h4>
                <p className="announcement-text-v2">{content}</p>
            </div>
        </motion.div>
    );
};

const AnnouncementsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const [selectedFestival, setSelectedFestival] = useState<string>('全部');

    const festivals = useMemo(() => {
        const uniqueFestivals = Array.from(new Set(announcementsData.map(item => item.festivalName)));
        return ['全部', ...uniqueFestivals];
    }, []);

    const groupedAnnouncements = useMemo(() => {
        const groups: Record<string, Announcement[]> = {};
        const dataToGroup = selectedFestival === '全部' 
            ? announcementsData 
            : announcementsData.filter(a => a.festivalName === selectedFestival);

        dataToGroup.forEach(item => {
            if (!groups[item.festivalName]) {
                groups[item.festivalName] = [];
            }
            groups[item.festivalName].push(item);
        });
        return groups;
    }, [selectedFestival]);

    const header = (
        <header className="modal-header-v2">
            <div className="relative w-full py-4 min-h-[56px]">
                {/* 左側按鈕：絕對定位在左邊 */}
                <button onClick={onClose} className="absolute left-4 top-1/2 -translate-y-1/2 z-10 close-btn-v2 flex items-center justify-center">
                    <ChevronLeft size={22} strokeWidth={1.5} />
                </button>
                
                {/* 中央標題：絕對定位在正中央，完全不佔空間，不被擠壓 */}
                <h2 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-bold tracking-[0.05em] uppercase text-gray-400 text-center pl-[0.05em] pointer-events-none whitespace-nowrap">
                </h2>
            </div>
        </header>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} headerContent={header} fullscreen>
            <div className="announcements-container-v2">
                {/* Festival Filter Tabs */}
                <div className="filter-section-v2">
                    <div className="filter-tabs-v2 no-scrollbar">
                        {festivals.map(fest => (
                            <button
                                key={fest}
                                onClick={() => setSelectedFestival(fest)}
                                className={`filter-tab-v2 ${selectedFestival === fest ? 'active' : ''}`}
                                style={selectedFestival === fest && fest !== '全部' ? { borderBottomColor: getFestivalColor(fest), color: getFestivalColor(fest) } : {}}
                            >
                                {fest}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="announcements-scroll-area">
                    <AnimatePresence mode="popLayout">
                        {(Object.entries(groupedAnnouncements) as [string, Announcement[]][]).map(([festival, items]) => (
                            <motion.div 
                                key={festival}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="announcement-group-v2"
                            >
                                <div className="group-header-v2">
                                    <div className="flex items-center gap-2">
                                        <div 
                                            className="group-indicator-v2" 
                                            style={{ backgroundColor: getFestivalColor(festival) }}
                                        />
                                        <h3 className="group-title-v2">{festival}</h3>
                                    </div>
                                    <span className="group-count-v2">
                                        {items.length}
                                    </span>
                                </div>
                                <div className="group-content-v2">
                                    {items.map(item => (
                                        <AnnouncementItem 
                                            key={item.id} 
                                            festivalName={item.festivalName} 
                                            title={item.title} 
                                            content={item.content} 
                                            timestamp={item.timestamp}
                                        />
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    
                    {announcementsData.length === 0 && (
                        <div className="empty-state-v2">
                            <div className="empty-icon-v2">📢</div>
                            <h3>目前尚無公告</h3>
                            <p>當有最新消息時，我們會第一時間通知您</p>
                        </div>
                    )}
                    
                    {announcementsData.length > 0 && Object.keys(groupedAnnouncements).length === 0 && (
                        <div className="empty-state-v2">
                            <div className="empty-icon-v2">🔍</div>
                            <h3>找不到相關公告</h3>
                            <p>試試看切換其他音樂祭類別</p>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

const LocationModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const locationSearchInputRef = useRef<HTMLInputElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const autocompleteRef = useRef<any>(null);
    const markersMapRef = useRef<{[id: string]: any}>({});
    const accuracyCircleRef = useRef<any>(null);
    const infoWindowRef = useRef<any>(null);
    const searchMarkerRef = useRef<any>(null);
    const hasAutoCenteredRef = useRef(false);
    const [mapError, setMapError] = useState<string | null>(null);
    const [debugInfo, setDebugInfo] = useState({ width: 0, height: 0, hasGoogle: false, hasMap: false });
    
    // Real-time geolocation state
    const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);
    const userLocationRef = useRef<{lat: number; lng: number} | null>(null);
    
    // Update ref whenever state changes
    useEffect(() => {
        userLocationRef.current = userLocation;
    }, [userLocation]);

    const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [isSimulated, setIsSimulated] = useState(false);
    const [isSharingLive, setIsSharingLive] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isFriendListOpen, setIsFriendListOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'festival' | 'route' | 'favorites'>('festival');
    const [friends, setFriends] = useState<Friend[]>(friendsData);
    const [newFriendId, setNewFriendId] = useState('');
    const [customMarkers, setCustomMarkers] = useState<any[]>(() => {
        const saved = localStorage.getItem('customMarkers');
        return saved ? JSON.parse(saved) : [];
    });
    const [newCustomMarkerName, setNewCustomMarkerName] = useState('');
    const [newCustomMarkerAddress, setNewCustomMarkerAddress] = useState('');
    const [isAddingCustomMarker, setIsAddingCustomMarker] = useState(false);
    const watchIdRef = useRef<number | null>(null);
    const userName = localStorage.getItem('userName') || 'User Name';

    const filteredMarkers = useMemo(() => {
        const upcomingFestivals = festivalsData
            .filter(f => !f.isEnded && f.lat && f.lng)
            .map(f => ({
                id: f.id,
                name: f.name,
                type: 'festival' as const,
                position: { x: 0, y: 0 },
                lat: f.lat!,
                lng: f.lng!,
                initials: '祭',
                status: f.dates,
                location: f.location,
                transportation: f.transportation
            }));

        const all = [
            ...friends.map(f => ({ ...f, type: 'friend' as const })),
            ...upcomingFestivals,
            ...customMarkers
        ];

        if (!searchTerm) return friends.map(f => ({ ...f, type: 'friend' as const }));
        
        const lowerTerm = searchTerm.toLowerCase();
        return all.filter(m => 
            m.name.toLowerCase().includes(lowerTerm) ||
            (m.status && m.status.toLowerCase().includes(lowerTerm)) ||
            (m.location && m.location.toLowerCase().includes(lowerTerm))
        );
    }, [searchTerm, friends, customMarkers]);

    const handleAddFriend = () => {
        if (!newFriendId.trim()) return;
        
        // Simulate finding a friend by ID
        const mockNames = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'James'];
        const randomName = mockNames[Math.floor(Math.random() * mockNames.length)];
        
        const newFriend: Friend = {
            id: `f${newFriendId.trim()}`,
            name: randomName,
            initials: randomName.charAt(0).toUpperCase(),
            status: '剛剛加入定位',
            position: { x: 50, y: 50 },
            lat: 25.0063 + (Math.random() - 0.5) * 0.002,
            lng: 121.2017 + (Math.random() - 0.5) * 0.002,
        };
        
        setFriends(prev => [...prev, newFriend]);
        setNewFriendId('');
    };

    const handleAddCustomMarker = async () => {
        if (!newCustomMarkerName.trim() || !newCustomMarkerAddress.trim()) {
            window.alert('請輸入主題與地址');
            return;
        }
        
        setIsAddingCustomMarker(true);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newCustomMarkerAddress)}`);
            const data = await response.json();
            
            if (data && data.length > 0) {
                const place = data[0];
                const lat = parseFloat(place.lat);
                const lng = parseFloat(place.lon);
                
                const newMarker = {
                    id: `custom_${Date.now()}`,
                    name: newCustomMarkerName.trim(),
                    type: 'custom_festival',
                    lat: lat,
                    lng: lng,
                    status: place.display_name || newCustomMarkerAddress.trim()
                };
                
                setCustomMarkers(prev => {
                    const updated = [...prev, newMarker];
                    localStorage.setItem('customMarkers', JSON.stringify(updated));
                    return updated;
                });
                
                setNewCustomMarkerName('');
                setNewCustomMarkerAddress('');
                
                if (mapInstanceRef.current) {
                    mapInstanceRef.current.panTo({ lat, lng });
                    mapInstanceRef.current.setZoom(17);
                }
            } else {
                window.alert("找不到該地址: '" + newCustomMarkerAddress + "'");
            }
        } catch (error) {
            console.error("Search error:", error);
            window.alert("搜尋地址時發生錯誤，請稍後再試。");
        } finally {
            setIsAddingCustomMarker(false);
        }
    };

    const handleSimulateLocation = useCallback(() => {
        setIsSimulated(true);
        setPermissionDenied(false);
        setMapError(null);
        hasAutoCenteredRef.current = true;
        // Set fake location to venue center
        const fakePos = { lat: 25.0063, lng: 121.2017 };
        setUserLocation(fakePos);
        setGpsAccuracy(20);
        
        if (mapInstanceRef.current) {
            mapInstanceRef.current.panTo(fakePos);
            mapInstanceRef.current.setZoom(17);
        }
    }, []);

    // Watch Position Effect
    useEffect(() => {
        if (isOpen && isSharingLive && navigator.geolocation && !isSimulated) {
             const geoOptions = { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 };

            watchIdRef.current = navigator.geolocation.watchPosition(
                (position) => {
                    const pos = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    setUserLocation(pos);
                    setGpsAccuracy(position.coords.accuracy);
                    setPermissionDenied(false);
                    
                    // Auto-center on first successful fix if map exists
                    if (mapInstanceRef.current && !hasAutoCenteredRef.current) {
                        mapInstanceRef.current.panTo(pos);
                        hasAutoCenteredRef.current = true;
                    }
                },
                (error) => {
                    console.warn(`Error watching position (${error.code}): ${error.message}`);
                    if (isSimulated) return;
                    if (error.code === 1) {
                        setPermissionDenied(true);
                        handleSimulateLocation();
                    }
                },
                geoOptions
            );
        } else {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        }
        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, [isOpen, isSharingLive, isSimulated, handleSimulateLocation]);

    // Update user object dynamically based on real location
    const user: Friend = useMemo(() => {
        let statusText = "定位中...";
        if (permissionDenied) {
            statusText = "請開啟位置權限以開始分享";
        } else if (!isSharingLive) {
            statusText = "定位分享已暫停";
        } else if (isSimulated) {
            statusText = "分享模擬位置中";
        } else if (userLocation) {
            statusText = "分享即時位置中";
        }

        return { 
            id: 'user', 
            name: '您在此處', 
            initials: '您', 
            status: statusText, 
            position: { x: 50, y: 80 }, 
            lat: userLocation?.lat ?? 25.0054, 
            lng: userLocation?.lng ?? 121.2017 
        };
    }, [userLocation, permissionDenied, isSimulated, isSharingLive]);
    
    const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

    const allMarkersData: (MapPoint | Friend | any)[] = useMemo(() => {
        const upcomingFestivals = festivalsData
            .filter(f => !f.isEnded && f.lat && f.lng)
            .map(f => ({
                id: f.id,
                name: f.name,
                type: 'festival' as const,
                position: { x: 0, y: 0 },
                lat: f.lat!,
                lng: f.lng!,
                initials: '祭',
                status: f.dates,
                location: f.location,
                transportation: f.transportation
            }));

        return [
            ...friends.map(f => ({ ...f, type: 'friend' as const })),
            ...upcomingFestivals,
            ...customMarkers,
            user
        ];
    }, [friends, user, customMarkers]);

    const handleNavigate = useCallback((destLat: number, destLng: number, destName?: string) => {
        if (infoWindowRef.current) {
            infoWindowRef.current.close();
        }

        // Use destination name if provided to get a more accurate route to the venue entrance,
        // otherwise fallback to exact coordinates.
        // Clean up the name by removing parentheses and anything after a slash 
        // (e.g., "高雄駁二藝術特區 (大義、蓬萊、海音中心)" -> "高雄駁二藝術特區")
        const cleanDestName = destName ? destName.split('/')[0].replace(/\s*\(.*?\)\s*/g, '').trim() : '';
        const destination = cleanDestName ? encodeURIComponent(cleanDestName) : `${destLat},${destLng}`;

        // Omit origin so Google Maps automatically uses the user's current device location
        const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
        window.open(url, '_blank');
    }, []);

    const handleLocateMe = () => {
        setIsSimulated(false);
        setPermissionDenied(false); 
        setMapError(null);
        setIsSharingLive(true); // Automatically resume sharing when manually locating
        hasAutoCenteredRef.current = true;
        
        if (!mapInstanceRef.current) return;
        
        if (userLocation && !isSimulated) {
             mapInstanceRef.current.panTo({ lat: userLocation.lat, lng: userLocation.lng });
             mapInstanceRef.current.setZoom(18); // Zoom in level 18
        }

        if (navigator.geolocation) {
             navigator.geolocation.getCurrentPosition(
                (position) => {
                    const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
                    setUserLocation(pos);
                    setGpsAccuracy(position.coords.accuracy);
                    setPermissionDenied(false);
                    if (mapInstanceRef.current) {
                        mapInstanceRef.current.panTo(pos);
                        mapInstanceRef.current.setZoom(18); // Detailed view
                    }
                },
                (error) => {
                    if (error.code === 1) {
                        handleSimulateLocation();
                    } else {
                        window.alert("定位失敗，請確認 GPS 已開啟。");
                    }
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }
    };

    useEffect(() => {
        if (!isOpen) {
            mapInstanceRef.current = null;
            markersMapRef.current = {};
            accuracyCircleRef.current = null;
            infoWindowRef.current = null;
            searchMarkerRef.current = null;
            hasAutoCenteredRef.current = false;
            return;
        }
        
        const createMarkerIcon = (type: string, initials?: string, scale: number = 1) => {
            if (type === 'user') {
                const size = 48 * scale;
                const svg = `
                <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="24" cy="24" r="18" fill="#43607D" fill-opacity="0.2">
                        <animate attributeName="r" values="12;18;12" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="fill-opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="24" cy="24" r="9" fill="white" stroke="#43607D" stroke-width="1"/>
                    <circle cx="24" cy="24" r="6" fill="#43607D"/>
                </svg>`;
                return {
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
                    scaledSize: new window.google.maps.Size(size, size),
                    anchor: new window.google.maps.Point(size/2, size/2),
                };
            }

            if (type === 'festival') {
                const size = 48 * scale;
                const svg = `
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
                    <defs>
                        <filter id="fest-shadow" x="-30%" y="-30%" width="160%" height="160%">
                            <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#CF9117" flood-opacity="0.5"/>
                        </filter>
                    </defs>
                    <circle cx="24" cy="24" r="18" fill="#CF9117" filter="url(#fest-shadow)" stroke="#FFFFFF" stroke-width="2.5"/>
                    <path d="M24 16 l2.1 6.3 h6.6 l-5.4 3.9 2.1 6.3 -5.4 -3.9 -5.4 3.9 2.1 -6.3 -5.4 -3.9 h6.6 z" fill="#FFFFFF" />
                </svg>`;
                return {
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
                    scaledSize: new window.google.maps.Size(size, size),
                    anchor: new window.google.maps.Point(size/2, size/2),
                };
            }

            if (type === 'custom_festival') {
                const size = 48 * scale;
                const svg = `
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
                    <defs>
                        <filter id="heart-shadow" x="-30%" y="-30%" width="160%" height="160%">
                            <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#B84C2E" flood-opacity="0.5"/>
                        </filter>
                    </defs>
                    <circle cx="24" cy="24" r="18" fill="#B84C2E" filter="url(#heart-shadow)" stroke="#FFFFFF" stroke-width="2.5"/>
                    <svg x="16" y="15.5" width="16" height="16" viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#FFFFFF"/>
                    </svg>
                </svg>`;
                return {
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
                    scaledSize: new window.google.maps.Size(size, size),
                    anchor: new window.google.maps.Point(size/2, size/2),
                };
            }

            let color = '#A78BFA'; 
            if (type === 'friend') color = '#43607D';
            if (type === 'stage') color = '#FB923C';
            if (type === 'food') color = '#F472B6';
            if (type === 'restroom') color = '#5D806A';
            
            const size = 36 * scale;
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="${color}" stroke="#FFF" stroke-width="2.5"/><text x="18" y="24" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#FFF" text-anchor="middle">${initials || ''}</text></svg>`;

            return {
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
                scaledSize: new window.google.maps.Size(size, size),
                anchor: new window.google.maps.Point(size/2, size/2),
            };
        };

        const initMap = (retryCount = 0) => {
            console.log(`[LocationModal] initMap called, retryCount: ${retryCount}`);
            
            if (mapRef.current) {
                setDebugInfo(prev => ({
                    ...prev,
                    width: mapRef.current!.clientWidth,
                    height: mapRef.current!.clientHeight,
                    hasGoogle: typeof window.google !== 'undefined',
                    hasMap: !!mapInstanceRef.current
                }));
            }

            if (!mapRef.current) {
                console.log(`[LocationModal] mapRef.current is null`);
                if (retryCount < 50) {
                    const timer = setTimeout(() => initMap(retryCount + 1), 100);
                    return;
                }
                return; // Modal is closed or not mounted, stop retrying
            }
            
            console.log(`[LocationModal] mapRef.current height: ${mapRef.current.clientHeight}, width: ${mapRef.current.clientWidth}`);
            
            if (typeof window.google === 'undefined' || typeof window.google.maps === 'undefined') {
                console.log(`[LocationModal] window.google is undefined`);
                if (retryCount < 50) {
                    const timer = setTimeout(() => initMap(retryCount + 1), 100);
                    return;
                }
                setMapError("無法載入地圖。請確認網路連線或重新整理頁面。");
                return;
            }
            setMapError(null);

            let map = mapInstanceRef.current;
            if (!map) {
                console.log(`[LocationModal] Creating new map instance`);
                map = new window.google.maps.Map(mapRef.current, {
                    center: { lat: 25.0063, lng: 121.2017 },
                    zoom: 17,
                    disableDefaultUI: true,
                });
                mapInstanceRef.current = map;
                
                map.addListener('zoom_changed', () => {
                    const zoom = map.getZoom() || 17;
                    const scale = Math.max(0.3, Math.min(3, Math.pow(1.15, zoom - 17)));
                    Object.values(markersMapRef.current).forEach((marker: any) => {
                        if (marker.markerType) {
                            marker.setIcon(createMarkerIcon(marker.markerType, marker.initials, scale));
                        }
                    });
                });
                
                infoWindowRef.current = new window.google.maps.InfoWindow();

                if (locationSearchInputRef.current && !autocompleteRef.current && window.google.maps.places) {
                    autocompleteRef.current = new window.google.maps.places.Autocomplete(locationSearchInputRef.current, {
                        fields: ['geometry', 'name', 'formatted_address'],
                        bounds: map.getBounds(),
                        strictBounds: false
                    });

                    autocompleteRef.current.addListener('place_changed', () => {
                        const place = autocompleteRef.current.getPlace();
                        if (!place.geometry || !place.geometry.location) {
                            return;
                        }

                        const lat = place.geometry.location.lat();
                        const lng = place.geometry.location.lng();
                        
                        map.setCenter({ lat, lng });
                        map.setZoom(17);

                        // Clear previous search marker if any
                        if (searchMarkerRef.current) {
                            searchMarkerRef.current.setMap(null);
                        }

                        // Add a temporary marker for the searched place
                        const searchMarker = new window.google.maps.Marker({
                            map,
                            position: { lat, lng },
                            title: place.name,
                            animation: window.google.maps.Animation.DROP
                        });
                        searchMarkerRef.current = searchMarker;

                        // Show info window for the searched place
                        const contentDiv = document.createElement('div');
                        contentDiv.style.padding = '8px';
                        contentDiv.style.maxWidth = '200px';
                        
                        const titleH3 = document.createElement('h3');
                        titleH3.style.margin = '0 0 8px 0';
                        titleH3.style.fontSize = '1rem';
                        titleH3.textContent = place.name;
                        contentDiv.appendChild(titleH3);
                        
                        const addrP = document.createElement('p');
                        addrP.style.margin = '0 0 8px 0';
                        addrP.style.fontSize = '0.8rem';
                        addrP.style.color = '#6B7280';
                        addrP.textContent = place.formatted_address || '';
                        contentDiv.appendChild(addrP);
                        
                        const navigateBtn = document.createElement('button');
                        navigateBtn.className = 'navigate-button';
                        navigateBtn.textContent = '規劃路線';
                        navigateBtn.style.width = '100%';
                        navigateBtn.style.marginTop = '8px';
                        navigateBtn.onclick = () => handleNavigate(lat, lng, place.name);
                        contentDiv.appendChild(navigateBtn);
                        
                        const addFavoriteBtn = document.createElement('button');
                        addFavoriteBtn.className = 'navigate-button';
                        addFavoriteBtn.textContent = '加入自訂標籤';
                        addFavoriteBtn.style.width = '100%';
                        addFavoriteBtn.style.marginTop = '8px';
                        addFavoriteBtn.style.backgroundColor = '#10B981';
                        addFavoriteBtn.onclick = () => {
                            const newMarker = {
                                id: `custom_${Date.now()}`,
                                name: place.name,
                                type: 'custom',
                                lat: lat,
                                lng: lng,
                                status: place.formatted_address || '自訂音樂祭標籤'
                            };
                            setCustomMarkers(prev => {
                                const updated = [...prev, newMarker];
                                localStorage.setItem('customMarkers', JSON.stringify(updated));
                                return updated;
                            });
                            setActiveTab('favorites');
                            infoWindowRef.current.close();
                            searchMarker.setMap(null);
                        };
                        contentDiv.appendChild(addFavoriteBtn);
                        
                        if (infoWindowRef.current) {
                            infoWindowRef.current.setContent(contentDiv);
                            infoWindowRef.current.open(map, searchMarker);
                        }
                    });
                }
            }

            // Sync User Accuracy Circle
            if (userLocation && mapInstanceRef.current) {
                if (!accuracyCircleRef.current) {
                    accuracyCircleRef.current = new window.google.maps.Circle({
                        map: mapInstanceRef.current,
                        fillColor: '#43607D',
                        fillOpacity: 0.15,
                        strokeColor: '#43607D',
                        strokeOpacity: 0.3,
                        strokeWeight: 1,
                        clickable: false,
                        zIndex: 1,
                    });
                }
                accuracyCircleRef.current.setCenter(userLocation);
                accuracyCircleRef.current.setRadius(gpsAccuracy || 0);
                accuracyCircleRef.current.setVisible(isSharingLive);
            }

            // Sync Markers
            const currentIds = new Set(allMarkersData.map(m => m.id));
            Object.keys(markersMapRef.current).forEach(id => {
                if (!currentIds.has(id)) {
                    markersMapRef.current[id].setMap(null);
                    delete markersMapRef.current[id];
                }
            });

            allMarkersData.forEach(markerData => {
                const markerType = (markerData as any).type || ((markerData.id === 'user') ? 'user' : 'friend');
                
                if (markersMapRef.current[markerData.id]) {
                    const existingMarker = markersMapRef.current[markerData.id];
                    existingMarker.setPosition({ lat: markerData.lat, lng: markerData.lng });
                    if (markerData.id === 'user') {
                        existingMarker.setOpacity(isSharingLive ? 1 : 0.5);
                    }
                    return;
                }

                const zoom = map.getZoom() || 17;
                const scale = Math.max(0.3, Math.min(3, Math.pow(1.15, zoom - 17)));

                const marker = new window.google.maps.Marker({
                    position: { lat: markerData.lat, lng: markerData.lng },
                    map: map,
                    title: markerData.name,
                    icon: createMarkerIcon(markerType, (markerData as any).initials, scale),
                    zIndex: markerType === 'user' ? 100 : 10,
                    opacity: (markerData.id === 'user' && !isSharingLive) ? 0.5 : 1
                });
                
                (marker as any).id = markerData.id;
                (marker as any).markerType = markerType;
                (marker as any).initials = (markerData as any).initials;

                marker.addListener('click', () => {
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'info-window-content';
                    const nameH4 = document.createElement('h4');
                    nameH4.textContent = markerData.name;
                    contentDiv.appendChild(nameH4);

                    const status = (markerData as any).status;
                    if (status && markerType !== 'friend') {
                        const statusP = document.createElement('p');
                        statusP.textContent = status;
                        contentDiv.appendChild(statusP);
                    }



                    if (markerType === 'festival') {
                        const navigateBtn = document.createElement('button');
                        navigateBtn.className = 'navigate-button';
                        navigateBtn.textContent = '規劃路線';
                        navigateBtn.style.width = '100%';
                        navigateBtn.style.marginTop = '8px';
                        const destName = markerData.location || markerData.name;
                        navigateBtn.onclick = () => handleNavigate(markerData.lat, markerData.lng, destName);
                        contentDiv.appendChild(navigateBtn);

                        const addFavoriteBtn = document.createElement('button');
                        addFavoriteBtn.className = 'navigate-button';
                        addFavoriteBtn.textContent = '加入我的最愛';
                        addFavoriteBtn.style.width = '100%';
                        addFavoriteBtn.style.marginTop = '8px';
                        addFavoriteBtn.style.backgroundColor = '#B84C2E';
                        addFavoriteBtn.onclick = () => {
                            const newMarker = {
                                id: `custom_${Date.now()}`,
                                name: markerData.name,
                                type: 'custom_festival',
                                lat: markerData.lat,
                                lng: markerData.lng,
                                status: (markerData as any).status || '自訂音樂祭標籤'
                            };
                            setCustomMarkers(prev => {
                                if (prev.some(m => m.name === newMarker.name && m.lat === newMarker.lat && m.lng === newMarker.lng)) {
                                    return prev;
                                }
                                const updated = [...prev, newMarker];
                                localStorage.setItem('customMarkers', JSON.stringify(updated));
                                return updated;
                            });
                            setActiveTab('favorites');
                            infoWindowRef.current.close();
                        };
                        contentDiv.appendChild(addFavoriteBtn);
                    }
                    
                    infoWindowRef.current.setContent(contentDiv);
                    infoWindowRef.current.open(map, marker);
                    setActiveMarkerId(markerData.id);
                });

                markersMapRef.current[markerData.id] = marker;
            });
        };
        
        setMapError(null);
        const timer = setTimeout(() => initMap(0), 100);
        
        return () => clearTimeout(timer);

    }, [isOpen, allMarkersData, userLocation, gpsAccuracy, isSharingLive]);

    const handleFriendClick = (markerId: string) => {
        const map = mapInstanceRef.current;
        const marker = markersMapRef.current[markerId];
        if (map && marker) {
            map.panTo(marker.getPosition());
            window.google.maps.event.trigger(marker, 'click');
        }
    };

    const toggleSharing = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsSharingLive(prev => !prev);
    };

    const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const query = e.currentTarget.value;
            if (!query) return;
            
            const map = mapInstanceRef.current;
            if (!map || !window.google || !window.google.maps || !window.google.maps.places) return;
            
            const service = new window.google.maps.places.PlacesService(map);
            
            service.textSearch({
                query: query,
                bounds: map.getBounds()
            }, (results: any, status: any) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
                    const place = results[0];
                    if (!place.geometry || !place.geometry.location) return;
                    
                    const lat = place.geometry.location.lat();
                    const lng = place.geometry.location.lng();
                    
                    map.setCenter({ lat, lng });
                    map.setZoom(17);
                    
                    // Create detailed content for InfoWindow
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'info-window-content search-result-info';
                    contentDiv.style.maxWidth = '250px';
                    
                    const nameH4 = document.createElement('h4');
                    nameH4.textContent = place.name || query;
                    nameH4.style.margin = '0 0 8px 0';
                    nameH4.style.fontSize = '16px';
                    contentDiv.appendChild(nameH4);

                    const addrP = document.createElement('p');
                    addrP.textContent = place.formatted_address || '';
                    addrP.style.margin = '4px 0';
                    addrP.style.fontSize = '13px';
                    addrP.style.color = '#6B7280';
                    contentDiv.appendChild(addrP);



                    // Clear previous search marker if any
                    if (searchMarkerRef.current) {
                        searchMarkerRef.current.setMap(null);
                    }

                    // Add a temporary marker for the searched place
                    const searchMarker = new window.google.maps.Marker({
                        map,
                        position: { lat, lng },
                        title: nameH4.textContent,
                        animation: window.google.maps.Animation.DROP
                    });
                    searchMarkerRef.current = searchMarker;

                    const navigateBtn = document.createElement('button');
                    navigateBtn.className = 'navigate-button';
                    navigateBtn.textContent = '規劃路線';
                    navigateBtn.style.width = '100%';
                    navigateBtn.style.marginTop = '8px';
                    navigateBtn.onclick = () => handleNavigate(lat, lng, place.name);
                    contentDiv.appendChild(navigateBtn);

                    const addFavoriteBtn = document.createElement('button');
                    addFavoriteBtn.className = 'navigate-button';
                    addFavoriteBtn.textContent = '加入我的最愛';
                    addFavoriteBtn.style.width = '100%';
                    addFavoriteBtn.style.marginTop = '8px';
                    addFavoriteBtn.style.backgroundColor = '#B84C2E';
                    addFavoriteBtn.onclick = () => {
                        const newMarker = {
                            id: `custom_${Date.now()}`,
                            name: nameH4.textContent || '自訂標籤',
                            type: 'custom_festival',
                            lat: lat,
                            lng: lng,
                            status: place.formatted_address || '自訂音樂祭標籤'
                        };
                        setCustomMarkers(prev => {
                            const updated = [...prev, newMarker];
                            localStorage.setItem('customMarkers', JSON.stringify(updated));
                            return updated;
                        });
                        setActiveTab('favorites');
                        infoWindowRef.current.close();
                        searchMarker.setMap(null);
                    };
                    contentDiv.appendChild(addFavoriteBtn);

                    if (!infoWindowRef.current) {
                        infoWindowRef.current = new window.google.maps.InfoWindow();
                    }
                    infoWindowRef.current.setContent(contentDiv);
                    infoWindowRef.current.open(map, searchMarker);

                    searchMarker.addListener('click', () => {
                        infoWindowRef.current.setContent(contentDiv);
                        infoWindowRef.current.open(map, searchMarker);
                    });
                } else {
                    window.alert("找不到該地點: '" + query + "'");
                }
            });
        }
    };

    const header = (
        <header className="modal-header" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            padding: '10px 15px', 
            marginBottom: 0,
            borderBottom: 'none',
            position: 'relative'
        }}>
            <button onClick={onClose} className="modal-back-button" style={{ 
                position: 'absolute', 
                left: '15px', 
                top: '50%', 
                transform: 'translateY(-50%)',
                zIndex: 10,
                padding: '5px',
                fontSize: '1.5rem',
                lineHeight: 1
            }}>&times;</button>
            <div style={{
                display: 'flex',
                gap: '6px',
                width: '100%',
                justifyContent: 'center',
                paddingLeft: '28px'
            }}>
                <button 
                    onClick={() => setActiveTab('festival')}
                    style={{ 
                        flex: 1,
                        padding: '8px 0', 
                        borderRadius: '20px', 
                        backgroundColor: activeTab === 'festival' ? '#43607D' : '#f3f4f6', 
                        color: activeTab === 'festival' ? 'white' : '#4b5563', 
                        border: 'none', 
                        fontSize: '13px', 
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        textAlign: 'center',
                        whiteSpace: 'nowrap'
                    }}>
                    音樂祭地圖
                </button>
                <button 
                    onClick={() => setActiveTab('route')}
                    style={{ 
                        flex: 1,
                        padding: '8px 0', 
                        borderRadius: '20px', 
                        backgroundColor: activeTab === 'route' ? '#43607D' : '#f3f4f6', 
                        color: activeTab === 'route' ? 'white' : '#4b5563', 
                        border: 'none', 
                        fontSize: '13px', 
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        textAlign: 'center',
                        whiteSpace: 'nowrap'
                    }}>
                    路線規劃
                </button>
                <button 
                    onClick={() => setActiveTab('favorites')}
                    style={{ 
                        flex: 1,
                        padding: '8px 0', 
                        borderRadius: '20px', 
                        backgroundColor: activeTab === 'favorites' ? '#43607D' : '#f3f4f6', 
                        color: activeTab === 'favorites' ? 'white' : '#4b5563', 
                        border: 'none', 
                        fontSize: '13px', 
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        textAlign: 'center',
                        whiteSpace: 'nowrap'
                    }}>
                    我的最愛
                </button>
            </div>
        </header>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} headerContent={header} fullscreen className="location-modal-v2">
             <div className="location-modal-body" style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                {mapError && (
                    <div className="map-error-message" style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center'}}>{mapError}</div>
                )}
                <div className="map-wrapper" style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}>
                            <div className="location-search-container" style={{
                                position: 'absolute',
                                top: '10px',
                                left: '10px',
                                right: '10px',
                                zIndex: 5,
                                display: 'flex',
                                gap: '8px'
                            }}>
                                <input 
                                    ref={locationSearchInputRef}
                                    type="text" 
                                    placeholder="搜尋地點..." 
                                    onKeyDown={handleSearchKeyDown}
                                    style={{
                                        flexGrow: 1,
                                        padding: '10px 15px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                        fontSize: '14px',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                            <div ref={mapRef} className="google-map-container" style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}></div>
                            <button className="locate-me-btn" onClick={handleLocateMe} aria-label="Locate me" style={{zIndex: 5}}>
                                <svg viewBox="0 0 24 24" height="24" width="24" xmlns="http://www.w3.org/2000/svg" fill="#43607D">
                                    <path d="M0 0h24v24H0z" fill="none"/>
                                    <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-7 7z"/>
                                </svg>
                            </button>

                            <button 
                                className="toggle-friend-list-btn" 
                                onClick={() => setIsFriendListOpen(true)}
                                style={{
                                    position: 'absolute',
                                    bottom: '1rem',
                                    left: '1rem',
                                    zIndex: 5,
                                    backgroundColor: 'white',
                                    border: 'none',
                                    borderRadius: '20px',
                                    padding: '8px 16px',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    color: '#374151'
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="9" cy="7" r="4"></circle>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                </svg>
                                好友列表
                            </button>
                        </div>
                        
                        {activeTab === 'favorites' && (
                            <div className="friend-list-container open" style={{zIndex: 10}}>
                                <div className="friend-list">
                                    <div className="friend-list-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
                                        <h4>我的最愛 (自訂音樂祭標籤)</h4>
                                        <button 
                                            onClick={() => setActiveTab('festival')}
                                            style={{background: 'none', border: 'none', fontSize: '1.5rem', color: '#9CA3AF', cursor: 'pointer', padding: '0 8px'}}
                                        >
                                            &times;
                                        </button>
                                    </div>
                                    <div style={{fontSize: '0.8rem', color: '#6B7280', marginBottom: '1rem'}}>
                                        您可以在地圖上搜尋地點，或在下方輸入主題與地址，將其加入為自訂的愛心音樂祭標籤。
                                    </div>
                                    <div style={{marginBottom: '1rem', padding: '1rem', backgroundColor: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB'}}>
                                        <h5 style={{margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#374151'}}>新增自訂標籤</h5>
                                        <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                                            <input 
                                                type="text" 
                                                placeholder="輸入主題 (例如：大港開唱)" 
                                                value={newCustomMarkerName}
                                                onChange={(e) => setNewCustomMarkerName(e.target.value)}
                                                style={{
                                                    padding: '0.6rem 1rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #E5E7EB',
                                                    fontSize: '0.9rem',
                                                    outline: 'none'
                                                }}
                                            />
                                            <input 
                                                type="text" 
                                                placeholder="輸入地址" 
                                                value={newCustomMarkerAddress}
                                                onChange={(e) => setNewCustomMarkerAddress(e.target.value)}
                                                style={{
                                                    padding: '0.6rem 1rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #E5E7EB',
                                                    fontSize: '0.9rem',
                                                    outline: 'none'
                                                }}
                                            />
                                            <button 
                                                onClick={handleAddCustomMarker}
                                                disabled={isAddingCustomMarker}
                                                style={{
                                                    padding: '0.6rem 1rem',
                                                    backgroundColor: isAddingCustomMarker ? '#9CA3AF' : '#B84C2E',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    fontSize: '0.9rem',
                                                    fontWeight: '500',
                                                    cursor: isAddingCustomMarker ? 'not-allowed' : 'pointer',
                                                    whiteSpace: 'nowrap',
                                                    marginTop: '4px'
                                                }}
                                            >
                                                {isAddingCustomMarker ? '新增中...' : '新增標籤'}
                                            </button>
                                        </div>
                                    </div>
                                    {customMarkers.length === 0 ? (
                                        <div style={{textAlign: 'center', padding: '2rem 0', color: '#9CA3AF'}}>
                                            目前沒有自訂標籤
                                        </div>
                                    ) : (
                                        customMarkers.map(marker => (
                                            <div 
                                                key={marker.id}
                                                className={`friend-list-item ${activeMarkerId === marker.id ? 'active' : ''}`}
                                                onClick={() => {
                                                    setActiveMarkerId(marker.id);
                                                    if (mapInstanceRef.current) {
                                                        mapInstanceRef.current.panTo({ lat: marker.lat, lng: marker.lng });
                                                        mapInstanceRef.current.setZoom(17);
                                                    }
                                                }}
                                            >
                                                <div className="friend-list-avatar" style={{backgroundColor: '#B84C2E'}}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" style={{transform: 'translateY(1px)'}}>
                                                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                                    </svg>
                                                </div>
                                                <div className="friend-list-details">
                                                    <div className="friend-list-name">{marker.name}</div>
                                                    <div className="friend-list-status" style={{fontSize: '0.75rem', color: '#6B7280'}}>{marker.status}</div>
                                                </div>
                                                <div style={{display: 'flex', gap: '8px', marginLeft: 'auto'}}>
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleNavigate(marker.lat, marker.lng);
                                                        }}
                                                        style={{
                                                            backgroundColor: '#43607D',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            padding: '4px 8px',
                                                            fontSize: '0.8rem',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        規劃路線
                                                    </button>
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setCustomMarkers(prev => {
                                                                const updated = prev.filter(m => m.id !== marker.id);
                                                                localStorage.setItem('customMarkers', JSON.stringify(updated));
                                                                return updated;
                                                            });
                                                        }}
                                                        style={{background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '4px'}}
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="3 6 5 6 21 6"></polyline>
                                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'route' && (
                            <div className="friend-list-container open" style={{zIndex: 10}}>
                                <div className="friend-list">
                                    <div className="friend-list-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
                                        <h4>音樂祭交通資訊與路線規劃</h4>
                                        <button 
                                            onClick={() => setActiveTab('festival')}
                                            style={{background: 'none', border: 'none', fontSize: '1.5rem', color: '#9CA3AF', cursor: 'pointer', padding: '0 8px'}}
                                        >
                                            &times;
                                        </button>
                                    </div>
                                    <div style={{fontSize: '0.8rem', color: '#6B7280', marginBottom: '1rem'}}>
                                        點擊下方音樂祭查看詳細交通資訊，並可直接規劃前往路線。
                                    </div>
                                    <div style={{display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '60vh', overflowY: 'auto'}}>
                                        {festivalsData.filter(f => !f.isEnded && f.lat && f.lng).map(festival => (
                                            <div 
                                                key={festival.id}
                                                style={{
                                                    padding: '1rem',
                                                    backgroundColor: '#F9FAFB',
                                                    borderRadius: '8px',
                                                    border: '1px solid #E5E7EB',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                onClick={() => {
                                                    if (mapInstanceRef.current) {
                                                        mapInstanceRef.current.panTo({ lat: festival.lat!, lng: festival.lng! });
                                                        mapInstanceRef.current.setZoom(15);
                                                    }
                                                    handleNavigate(festival.lat!, festival.lng!, festival.location);
                                                }}
                                            >
                                                <h5 style={{margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#374151', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                                    {festival.name}
                                                    <span style={{fontSize: '0.8rem', color: '#43607D', backgroundColor: '#E5E7EB', padding: '4px 8px', borderRadius: '12px'}}>
                                                        規劃路線
                                                    </span>
                                                </h5>
                                                <div style={{fontSize: '0.85rem', color: '#6B7280', whiteSpace: 'pre-line'}}>
                                                    {festival.transportation || '尚無交通資訊'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className={`friend-list-container ${isFriendListOpen ? 'open' : ''}`}>
                            <div className="friend-list">
                                <div className="friend-list-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
                                    <h4>定位狀態與朋友</h4>
                                    <button 
                                        onClick={() => setIsFriendListOpen(false)}
                                        style={{background: 'none', border: 'none', fontSize: '1.5rem', color: '#9CA3AF', cursor: 'pointer', padding: '0 8px'}}
                                    >
                                        &times;
                                    </button>
                                </div>
                                <div style={{fontSize: '0.8rem', color: '#6B7280', marginBottom: '1rem'}}>
                                    您的 ID: <span style={{fontWeight: '600', color: '#43607D'}}>{userName.substring(0, 3).toUpperCase()}{Math.abs(userName.length * 12345 % 10000)}</span>
                                </div>
                                <div className="friend-search-wrapper" style={{padding: '0 0 1rem 0'}}>
                                    <div style={{display: 'flex', gap: '8px', marginBottom: '8px'}}>
                                        <input 
                                            type="text" 
                                            placeholder="輸入好友 ID 加入定位..." 
                                            className="friend-search-input"
                                            value={newFriendId}
                                            onChange={(e) => setNewFriendId(e.target.value)}
                                            style={{
                                                flexGrow: 1,
                                                padding: '0.6rem 1rem',
                                                borderRadius: '8px',
                                                border: '1px solid #E5E7EB',
                                                fontSize: '0.9rem',
                                                outline: 'none'
                                            }}
                                        />
                                        <button 
                                            onClick={handleAddFriend}
                                            style={{
                                                padding: '0.6rem 1rem',
                                                backgroundColor: '#43607D',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '8px',
                                                fontSize: '0.9rem',
                                                fontWeight: '500',
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            加入
                                        </button>
                                    </div>
                                    <input 
                                        type="text" 
                                        placeholder="搜尋朋友、音樂祭或標籤..." 
                                        className="friend-search-input"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '0.6rem 1rem',
                                            borderRadius: '8px',
                                            border: '1px solid #E5E7EB',
                                            fontSize: '0.9rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                                {!searchTerm && (
                                    <div 
                                        className={`friend-list-item user-list-item ${activeMarkerId === user.id ? 'active' : ''}`}
                                        onClick={() => handleFriendClick(user.id)}
                                    >
                                        <div className="friend-list-avatar user-avatar" style={{backgroundColor: isSharingLive ? '#43607D' : '#9CA3AF'}}>您</div>
                                        <div className="friend-list-details">
                                            <div className="user-status-row" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                                                <span className="friend-list-name" style={{color: isSharingLive ? '#43607D' : '#6B7280'}}>您正在這裡</span>
                                                <button 
                                                    className={`toggle-sharing-btn ${isSharingLive ? 'active' : ''}`} 
                                                    onClick={toggleSharing}
                                                    aria-label={isSharingLive ? "Pause sharing" : "Resume sharing"}
                                                >
                                                    {isSharingLive ? "暫停分享" : "恢復分享"}
                                                </button>
                                            </div>
                                            <span className="friend-list-status">{user.status}</span>
                                        </div>
                                    </div>
                                )}
                                {filteredMarkers.map(marker => {
                                    let bgColor = '#43607D';
                                    if (marker.type === 'festival') bgColor = '#CF9117';
                                    if (marker.type === 'custom') bgColor = '#10B981';
                                    
                                    return (
                                        <div 
                                            key={marker.id} 
                                            className={`friend-list-item ${activeMarkerId === marker.id ? 'active' : ''}`}
                                            onClick={() => handleFriendClick(marker.id)}
                                        >
                                            <div className="friend-list-avatar" style={{backgroundColor: bgColor, color: 'white'}}>{marker.initials || marker.name.charAt(0).toUpperCase()}</div>
                                            <div className="friend-list-details">
                                                <span className="friend-list-name">{marker.name}</span>
                                                {(marker.status || marker.location) && (
                                                    <span className="friend-list-status" style={{fontSize: '0.8rem', color: '#6B7280'}}>{marker.status || marker.location}</span>
                                                )}
                                            </div>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const destName = marker.type === 'festival' ? marker.location : marker.name;
                                                    handleNavigate(marker.lat, marker.lng, destName);
                                                }}
                                                style={{
                                                    backgroundColor: bgColor,
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    padding: '4px 8px',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer',
                                                    marginLeft: 'auto'
                                                }}
                                            >
                                                規劃路線
                                            </button>
                                        </div>
                                    );
                                })}
                                {filteredMarkers.length === 0 && searchTerm && (
                                    <div style={{padding: '2rem', textAlign: 'center', color: '#6B7280'}}>
                                        找不到符合的標記
                                    </div>
                                )}
                            </div>
                        </div>
            </div>
        </Modal>
    );
};

const TimetableModal: React.FC<{
    isOpen: boolean;
    data: { festival: Festival; date: Date }; 
    onClose: () => void;
    userSchedule: Set<string>;
    onToggleSchedule: (id: string) => void;
}> = ({ isOpen, data, onClose, userSchedule, onToggleSchedule }) => {
    const { festival, date } = data;
    const dateKey = getDateKey(date);
    const dailySchedule = timetablesData[festival.id]?.[dateKey];

    const formattedDate = date.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' });

    const header = (
        <header className="modal-header">
            <button onClick={onClose} className="modal-back-button">
                <ChevronLeft size={20} />
                <span>返回</span>
            </button>
            <div className="modal-title timetable-header-title">
                <h2>{festival.name}</h2>
                <span className="subtitle">{formattedDate} • 官方時刻表</span>
            </div>
            <div className="modal-header-placeholder"></div>
        </header>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} headerContent={header} fullscreen className="timetable-modal">
            {dailySchedule ? (
                Object.entries(dailySchedule).map(([stageName, performances]) => (
                    <div key={stageName} className="timetable-stage">
                        {stageName && <h3 className="timetable-stage-name">{stageName}</h3>}
                        <div className="timetable-performance-list">
                            {performances.map((p, index) => {
                                const performanceId = `${festival.id}||${dateKey}||${stageName}||${p.time}||${p.artist}`;
                                const isAdded = userSchedule.has(performanceId);
                                return (
                                    <div key={index} className="timetable-performance-item">
                                        <div className="performance-time-container">
                                            <span className="performance-time">{p.time}</span>
                                        </div>
                                        <span className="performance-artist">{p.artist}</span>
                                        <button 
                                            className={`add-to-schedule-btn ${isAdded ? 'added' : ''}`}
                                            onClick={() => onToggleSchedule(performanceId)}
                                            aria-label={isAdded ? 'Remove from schedule' : 'Add to schedule'}
                                        >
                                            {isAdded ? <Music size={16} /> : '+'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))
            ) : (
                <p className="no-timetable-message">本日時刻表尚未公布</p>
            )}
        </Modal>
    );
};

const UserTimetableModal: React.FC<{ 
    isOpen: boolean;
    data: { festival: Festival; date: Date }; 
    onClose: () => void;
    userSchedule: Set<string>;
    onToggleSchedule: (id: string) => void;
}> = ({ isOpen, data, onClose, userSchedule, onToggleSchedule }) => {
    const { festival, date } = data;
    const dateKey = getDateKey(date);
    const formattedDate = date.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' });

    const scheduledPerformances = useMemo<{ id: string; time: string; artist: string; stage: string }[] | null>(() => {
        const performancesForDay = [...userSchedule].filter((id: string) => {
            const parts = id.split('||');
            return parts[0] === festival.id && parts[1] === dateKey;
        });

        if (performancesForDay.length === 0) {
            return null;
        }

        const performances = performancesForDay.map(id => {
            const [, , stageName, time, artist] = id.split('||');
            return { id, time, artist, stage: stageName };
        });
        
        performances.sort((a, b) => a.time.localeCompare(b.time));

        return performances;
    }, [userSchedule, festival.id, dateKey]);
    
    const header = (
        <header className="modal-header">
            <button onClick={onClose} className="modal-back-button">&times;</button>
            <div className="modal-title timetable-header-title">
                <h2>{festival.name}</h2>
                <span>{formattedDate} - 我的行程</span>
            </div>
            <div className="modal-header-placeholder"></div>
        </header>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} headerContent={header} fullscreen className="timetable-modal">
            {scheduledPerformances ? (
                <div className="timetable-performance-list">
                    {scheduledPerformances.map((p) => {
                        const isAdded = userSchedule.has(p.id);
                        return (
                            <div key={p.id} className="timetable-performance-item">
                                <div className="performance-time-container">
                                    <span className="performance-time">{p.time}</span>
                                </div>
                                <div className="performance-details" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                    <span className="performance-artist">{p.artist}</span>
                                    <span className="performance-stage" style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: '4px' }}>{p.stage}</span>
                                </div>
                                <button 
                                    className={`add-to-schedule-btn ${isAdded ? 'added' : ''}`}
                                    style={isAdded ? { backgroundColor: getFestivalColor(festival.name), borderColor: getFestivalColor(festival.name) } : {}}
                                    onClick={() => onToggleSchedule(p.id)}
                                    aria-label={isAdded ? 'Remove from schedule' : 'Add to schedule'}
                                >
                                    {isAdded ? <Music size={16} /> : '+'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="no-timetable-message">您的行程表是空的，請至官方時刻表新增。</p>
            )}
        </Modal>
    );
};

const DailyPlannerModal: React.FC<{
    isOpen: boolean;
    date: Date;
    onClose: () => void;
    schedule: { title: string; items: CustomScheduleItem[] };
    onUpdateSchedule: (schedule: { title: string; items: CustomScheduleItem[] }) => void;
    festivalsOnDay: FestivalWithDates[];
    onShowTimetable: (type: 'official' | 'user', festival: Festival, date: Date) => void;
    userSchedule: Set<string>;
    onToggleSchedule: (id: string) => void;
}> = ({ isOpen, date, onClose, schedule, onUpdateSchedule, festivalsOnDay, onShowTimetable, userSchedule, onToggleSchedule }) => {
    const [items, setItems] = useState<CustomScheduleItem[]>(schedule.items);
    const [title, setTitle] = useState(schedule.title);
    const [newTime, setNewTime] = useState('');
    const [newActivity, setNewActivity] = useState('');

    useEffect(() => {
        setTitle(schedule.title);
        setItems(schedule.items);
    }, [schedule]);

    const formattedDate = date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });

    const handleAddItem = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newActivity.trim()) return;

        const newItem: CustomScheduleItem = {
            id: Date.now().toString(),
            time: newTime || '全日',
            activity: newActivity.trim(),
        };

        const updatedItems = [...items, newItem].sort((a, b) => a.time.localeCompare(b.time));
        setItems(updatedItems);
        setNewTime('');
        setNewActivity('');
    };

    const handleDeleteItem = (idToDelete: string) => {
        setItems(items.filter(item => item.id !== idToDelete));
    };
    
    const handleSaveAndClose = () => {
        onUpdateSchedule({ title, items });
        onClose();
    };

    const combinedItems = useMemo(() => {
        const dateKey = getDateKey(date);
        const officialItems = [...userSchedule]
            .filter(id => id.includes(`||${dateKey}||`))
            .map(id => {
                const [festivalId, , stageName, time, artist] = id.split('||');
                const festival = festivalsOnDay.find(f => f.id === festivalId);
                return {
                    id,
                    time,
                    activity: artist,
                    stage: stageName,
                    festivalName: festival?.name || '',
                    isOfficial: true
                };
            });

        const customItems = items.map(item => ({
            ...item,
            isOfficial: false
        }));

        return [...officialItems, ...customItems].sort((a, b) => a.time.localeCompare(b.time));
    }, [items, userSchedule, date, festivalsOnDay]);

    return (
        <Modal isOpen={isOpen} onClose={handleSaveAndClose} title={formattedDate} className="daily-planner-modal">
            <div className="daily-planner-content">
                {festivalsOnDay && festivalsOnDay.length > 0 && (
                    <div className="daily-planner-festival-section">
                        {festivalsOnDay.map(fest => (
                            <div key={fest.id} className="festival-timetable-group">
                                <h4 className="daily-planner-festival-name" style={{ color: getFestivalColor(fest.name), borderLeft: `4px solid ${getFestivalColor(fest.name)}`, paddingLeft: '8px' }}>
                                    {fest.name.replace(/\s*\d{4}$/, '')}
                                </h4>
                                <div className="timetable-buttons">
                                    <button className="timetable-button" onClick={() => onShowTimetable('official', fest, date)}>官方時刻表</button>
                                    <button className="timetable-button" onClick={() => onShowTimetable('user', fest, date)}>我的行程</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <div className="daily-planner-personal-section">
                    <h4 className="personal-section-header">個人行程</h4>
                    <input
                        type="text"
                        placeholder="行程主題"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="schedule-title-input"
                    />
                    <form className="add-schedule-form" onSubmit={handleAddItem}>
                        <input
                            type="text"
                            placeholder="時間"
                            value={newTime}
                            onChange={(e) => setNewTime(e.target.value)}
                            className="schedule-time-input"
                        />
                        <input
                            type="text"
                            placeholder="新增活動..."
                            value={newActivity}
                            onChange={(e) => setNewActivity(e.target.value)}
                            required
                            className="schedule-activity-input"
                        />
                        <button type="submit">新增</button>
                    </form>
                    <div className="custom-schedule-list">
                        {combinedItems.length > 0 ? (
                            combinedItems.map(item => (
                                <div key={item.id} className={`custom-schedule-item ${item.isOfficial ? 'official-item' : ''}`}>
                                    <span className="schedule-item-time">{item.time}</span>
                                    <div className="schedule-item-details" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                        <span className="schedule-item-activity">{item.activity}</span>
                                        {item.isOfficial && (
                                            <span className="schedule-item-stage" style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: '2px' }}>
                                                {item.stage}
                                            </span>
                                        )}
                                    </div>
                                    {item.isOfficial ? (
                                        <button onClick={() => onToggleSchedule(item.id)} className="delete-schedule-item-btn" aria-label="Remove from schedule">
                                            <Music size={16} />
                                        </button>
                                    ) : (
                                        <button onClick={() => handleDeleteItem(item.id)} className="delete-schedule-item-btn" aria-label="Delete item">&times;</button>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="no-timetable-message">本日尚無行程，請在上方新增。</p>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

interface ListingDetailsState {
    festivalName: string;
    address: string;
    checkInTime: string;
    pricePerNight: string;
    description: string;
    photos: string[];
}

const CreateAccommodationForm: React.FC<{
    onSubmit: (listing: Omit<AccommodationListing, 'id' | 'host' | 'position'>) => void;
    initialData?: Omit<AccommodationListing, 'id' | 'host' | 'position'>;
    isEditing: boolean;
}> = ({ onSubmit, initialData, isEditing }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [listingDetails, setListingDetails] = useState<ListingDetailsState>({
        festivalName: '',
        address: '',
        checkInTime: '',
        pricePerNight: '',
        description: '',
        photos: [], // Store photos as data URLs
    });

    useEffect(() => {
        if (isEditing && initialData) {
            setListingDetails({
                festivalName: initialData.festivalName,
                address: initialData.address,
                checkInTime: initialData.checkInTime,
                pricePerNight: String(initialData.pricePerNight),
                description: initialData.description,
                photos: Array.isArray(initialData.photos) ? initialData.photos : [],
            });
        } else {
            setListingDetails({
                festivalName: '',
                address: '',
                checkInTime: '',
                pricePerNight: '',
                description: '',
                photos: [],
            });
        }
    }, [isEditing, initialData]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setListingDetails(prev => ({...prev, [name]: value}));
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { files } = e.target;
        if (!files) return;

        const MAX_PHOTOS = 5;
        if (listingDetails.photos.length + files.length > MAX_PHOTOS) {
            alert(`最多只能上傳 ${MAX_PHOTOS} 張照片。`);
            return;
        }

        Array.from(files).forEach((file: File) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setListingDetails(prev => ({
                    ...prev,
                    photos: [...prev.photos, reader.result as string]
                }));
            };
            reader.readAsDataURL(file);
        });
    };

    const removePhoto = (index: number) => {
        setListingDetails(prev => ({
            ...prev,
            photos: prev.photos.filter((_, i) => i !== index)
        }));
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!listingDetails.festivalName || !listingDetails.address || !listingDetails.pricePerNight || !listingDetails.checkInTime) {
            alert('請填寫所有必填欄位');
            return;
        }
        onSubmit({
            ...listingDetails,
            pricePerNight: parseInt(listingDetails.pricePerNight, 10),
        });
    };

    return (
        <form className="create-accommodation-form" onSubmit={handleSubmit}>
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handlePhotoUpload}
                multiple 
                accept="image/*" 
                style={{display: 'none'}}
            />
            <div className="form-group">
                <label htmlFor="festivalName" className="form-label">目標音樂祭</label>
                 <input type="text" id="festivalName" name="festivalName" value={listingDetails.festivalName} onChange={handleInputChange} required className="form-input" placeholder="例如：浪人祭" />
            </div>
            <div className="form-group">
                <label htmlFor="address" className="form-label">住宿地址</label>
                <input type="text" id="address" name="address" value={listingDetails.address} onChange={handleInputChange} required className="form-input" placeholder="例如：台南市安平區" />
            </div>
            <div className="form-group-inline">
                <div className="form-group">
                    <label htmlFor="pricePerNight" className="form-label">每晚價格 (TWD)</label>
                    <input type="number" id="pricePerNight" name="pricePerNight" value={listingDetails.pricePerNight} onChange={handleInputChange} required className="form-input" min="0" />
                </div>
                 <div className="form-group">
                    <label htmlFor="checkInTime" className="form-label">入住時間</label>
                     <input type="text" id="checkInTime" name="checkInTime" value={listingDetails.checkInTime} onChange={handleInputChange} required className="form-input" placeholder="例如: 15:00" />
                </div>
            </div>
             <div className="form-group">
                <label htmlFor="description" className="form-label">描述</label>
                <textarea id="description" name="description" value={listingDetails.description} onChange={handleInputChange} className="form-input" placeholder="例如：提供沙發床、限女性..."></textarea>
            </div>
            <div className="form-group">
                <label className="form-label">照片 (最多5張)</label>
                <div className="photo-upload-preview-grid">
                    {listingDetails.photos.map((photo, index) => (
                        <div key={index} className="photo-preview-item">
                            <img src={photo} alt={`preview ${index + 1}`} />
                            <button type="button" onClick={() => removePhoto(index)} className="remove-photo-btn">&times;</button>
                        </div>
                    ))}
                    {listingDetails.photos.length < 5 && (
                         <button type="button" onClick={() => fileInputRef.current?.click()} className="add-photo-btn">+</button>
                    )}
                </div>
            </div>
            <button type="submit" className="form-submit-btn">{isEditing ? '儲存變更' : '發佈住宿資訊'}</button>
        </form>
    );
};

const AccommodationCard: React.FC<{
    listing: AccommodationListing;
    onContact: (listing: AccommodationListing) => void;
    onEdit: (listing: AccommodationListing) => void;
    onDelete: (listingId: string) => void;
}> = ({ listing, onContact, onEdit, onDelete }) => {
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const isOwner = listing.host.name === 'User'; // Simple check for ownership

    const goToNextPhoto = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentPhotoIndex(prev => (prev + 1) % listing.photos.length);
    };

    const goToPrevPhoto = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentPhotoIndex(prev => (prev - 1 + listing.photos.length) % listing.photos.length);
    };

    return (
        <div className="accommodation-card">
             {isOwner && (
                <div className="card-actions">
                    <button onClick={() => onEdit(listing)} className="edit-btn">編輯</button>
                    <button onClick={() => onDelete(listing.id)} className="delete-btn">刪除</button>
                </div>
            )}
             <div className="accommodation-photo-gallery">
                {listing.photos && listing.photos.length > 0 ? (
                    <>
                        <img src={listing.photos[currentPhotoIndex]} alt={`${listing.address} photo ${currentPhotoIndex + 1}`} />
                        {listing.photos.length > 1 && (
                            <>
                                <button onClick={goToPrevPhoto} className="photo-nav-btn prev" aria-label="Previous photo">&#10094;</button>
                                <button onClick={goToNextPhoto} className="photo-nav-btn next" aria-label="Next photo">&#10095;</button>
                                <div className="photo-dots">
                                    {listing.photos.map((_, index) => (
                                        <span key={index} className={`dot ${index === currentPhotoIndex ? 'active' : ''}`}></span>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="photo-placeholder">
                        <svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 0 24 24" width="48px" fill="#9CA3AF"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                    </div>
                )}
            </div>
            <div className="accommodation-card-header">
                <h4 className="accommodation-destination"> near {listing.festivalName}</h4>
            </div>
            <div className="accommodation-card-body">
                <p><strong>地點:</strong> {listing.address}</p>
                <p><strong>價格:</strong> ${listing.pricePerNight} / 晚</p>
                <p><strong>入住時間:</strong> {listing.checkInTime}</p>
                 <div className="accommodation-notes">
                    <p>{listing.description}</p>
                </div>
            </div>
            <div className="accommodation-card-footer">
                <div className="accommodation-host-info">
                    <div className="host-avatar">{listing.host.initials}</div>
                    <span>{listing.host.name}</span>
                </div>
                 {!isOwner && <button onClick={() => onContact(listing)} className="accommodation-join-btn">傳送訊息</button>}
            </div>
        </div>
    );
};

const CreateCarpoolForm: React.FC<{
    onSubmit: (trip: Omit<CarpoolTrip, 'id' | 'driver'>) => void;
    initialData?: Omit<CarpoolTrip, 'id' | 'driver'>;
    isEditing: boolean;
}> = ({ onSubmit, initialData, isEditing }) => {
    const [tripDetails, setTripDetails] = useState({
        festivalName: '',
        origin: '',
        departureTime: '',
        notes: '',
    });

    useEffect(() => {
        if (isEditing && initialData) {
            setTripDetails({
                festivalName: initialData.festivalName,
                origin: initialData.origin,
                departureTime: initialData.departureTime,
                notes: initialData.notes,
            });
        } else {
            setTripDetails({ festivalName: '', origin: '', departureTime: '', notes: '' });
        }
    }, [isEditing, initialData]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setTripDetails(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!tripDetails.festivalName || !tripDetails.origin || !tripDetails.departureTime) {
            alert('請填寫所有必填欄位');
            return;
        }
        onSubmit(tripDetails);
    };

    return (
        <form className="create-carpool-form" onSubmit={handleSubmit}>
            <div className="form-group">
                <label htmlFor="festivalName" className="form-label">目標音樂祭</label>
                <input type="text" id="festivalName" name="festivalName" value={tripDetails.festivalName} onChange={handleInputChange} required className="form-input" placeholder="例如：火球祭" />
            </div>
            <div className="form-group-inline">
                <div className="form-group">
                    <label htmlFor="origin" className="form-label">出發地</label>
                    <input type="text" id="origin" name="origin" value={tripDetails.origin} onChange={handleInputChange} required className="form-input" placeholder="例如：台北車站" />
                </div>
                <div className="form-group">
                    <label htmlFor="departureTime" className="form-label">出發時間</label>
                    <input type="text" id="departureTime" name="departureTime" value={tripDetails.departureTime} onChange={handleInputChange} required className="form-input" placeholder="例如：11/30 08:00" />
                </div>
            </div>
            <div className="form-group">
                <label htmlFor="notes" className="form-label">備註</label>
                <textarea id="notes" name="notes" value={tripDetails.notes} onChange={handleInputChange} className="form-input" placeholder="例如：分攤油錢、禁菸..."></textarea>
            </div>
            <button type="submit" className="form-submit-btn">{isEditing ? '儲存變更' : '發佈共乘資訊'}</button>
        </form>
    );
};

const CarpoolCard: React.FC<{
    trip: CarpoolTrip;
    onContact: (trip: CarpoolTrip) => void;
    onEdit: (trip: CarpoolTrip) => void;
    onDelete: (tripId: string) => void;
}> = ({ trip, onContact, onEdit, onDelete }) => {
    const isOwner = trip.driver.name === 'User';

    const formatDateTime = (dateTimeString: string) => {
        if (!dateTimeString) return '';
        const date = new Date(dateTimeString);
        if (isNaN(date.getTime())) {
            return dateTimeString;
        }
        return date.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="carpool-card">
            {isOwner && (
                <div className="card-actions">
                    <button onClick={() => onEdit(trip)} className="edit-btn">編輯</button>
                    <button onClick={() => onDelete(trip.id)} className="delete-btn">刪除</button>
                </div>
            )}
            <div className="carpool-card-header">
                <h4 className="carpool-destination">前往 {trip.festivalName}</h4>
            </div>
            <div className="carpool-card-body">
                <p><strong>出發地:</strong> {trip.origin}</p>
                <p><strong>出發時間:</strong> {formatDateTime(trip.departureTime)}</p>
                <div className="carpool-notes">
                    <p>{trip.notes}</p>
                </div>
            </div>
            <div className="carpool-card-footer">
                <div className="carpool-driver-info">
                    <div className="driver-avatar">{trip.driver.initials}</div>
                    <span>{trip.driver.name}</span>
                </div>
                {!isOwner && <button onClick={() => onContact(trip)} className="carpool-join-btn">傳送訊息</button>}
            </div>
        </div>
    );
};

const ConfirmationDialog: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
}> = ({ isOpen, onClose, onConfirm, title, message }) => {
    if (!isOpen) return null;
    return (
        <div className="confirmation-dialog-overlay" onClick={onClose}>
            <div className="confirmation-dialog" onClick={e => e.stopPropagation()}>
                <h4>{title}</h4>
                <p>{message}</p>
                <div className="confirmation-actions">
                    <button onClick={onClose} className="cancel-btn">取消</button>
                    <button onClick={onConfirm} className="confirm-btn">確認</button>
                </div>
            </div>
        </div>
    );
};

const CarpoolModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    carpools: CarpoolTrip[];
    setCarpools: React.Dispatch<React.SetStateAction<CarpoolTrip[]>>;
    conversations: Conversation[];
    setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
    navigateTo: (screen: Screen) => void;
}> = ({ isOpen, onClose, carpools, setCarpools, conversations, setConversations, navigateTo }) => {
    const [showForm, setShowForm] = useState(false);
    const [editingTrip, setEditingTrip] = useState<CarpoolTrip | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    
    // Filter states
    const [filterFestival, setFilterFestival] = useState('');
    const [filterOrigin, setFilterOrigin] = useState('');

    const filteredCarpools = useMemo(() => {
        return carpools.filter(trip => {
            const matchFestival = !filterFestival || trip.festivalName.toLowerCase().includes(filterFestival.toLowerCase());
            const matchOrigin = !filterOrigin || trip.origin.toLowerCase().includes(filterOrigin.toLowerCase());
            return matchFestival && matchOrigin;
        });
    }, [carpools, filterFestival, filterOrigin]);

    const handleContact = (trip: CarpoolTrip) => {
        const conversationId = `carpool-${trip.id}`;
        const existingConv = conversations.find(c => c.id === conversationId);
        
        if (!existingConv) {
            const newConv: Conversation = {
                id: conversationId,
                participant: { name: trip.driver.name, initials: trip.driver.initials },
                topic: `前往 ${trip.festivalName}`,
                messages: [
                    { id: `m${Date.now()}`, text: `你好，我想詢問關於前往 ${trip.festivalName} 的共乘！`, sender: 'user', timestamp: new Date() }
                ]
            };
            setConversations([newConv, ...conversations]);
        }
        
        onClose();
        navigateTo('messages', conversationId);
    };

    const handleFormSubmit = (tripData: Omit<CarpoolTrip, 'id' | 'driver'>) => {
        if (editingTrip) {
            setCarpools(carpools.map(t => t.id === editingTrip.id ? { ...editingTrip, ...tripData } : t));
        } else {
            const newTrip: CarpoolTrip = {
                ...tripData,
                id: `c${Date.now()}`,
                driver: { name: 'User', initials: 'U' },
            };
            setCarpools([newTrip, ...carpools]);
        }
        setShowForm(false);
        setEditingTrip(null);
    };
    
    const handleEdit = (trip: CarpoolTrip) => {
        setEditingTrip(trip);
        setShowForm(true);
    };
    
    const handleDeleteConfirm = () => {
        if (confirmDeleteId) {
            setCarpools(carpools.filter(t => t.id !== confirmDeleteId));
            setConfirmDeleteId(null);
        }
    };

    const handleBack = () => {
        if (showForm) {
            setShowForm(false);
            setEditingTrip(null);
        } else {
            onClose();
        }
    };

    const header = (
        <header className="modal-header">
            <button onClick={handleBack} className="modal-back-button">&lt; Back</button>
            <h2 className="modal-title">{showForm ? (editingTrip ? '編輯共乘' : '新增共乘') : '共乘'}</h2>
            <div className="modal-header-placeholder"></div>
        </header>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} headerContent={header} fullscreen className="carpool-modal">
            <div className="modal-feature-container carpool-feature-container">
                {showForm ? (
                    <div className="form-wrapper">
                        <CreateCarpoolForm
                            onSubmit={handleFormSubmit}
                            isEditing={!!editingTrip}
                            initialData={editingTrip || undefined}
                        />
                    </div>
                ) : (
                    <>
                        <div className="list-filters">
                            <div className="filter-group">
                                <input 
                                    type="text" 
                                    placeholder="搜尋音樂祭..." 
                                    value={filterFestival} 
                                    onChange={(e) => setFilterFestival(e.target.value)}
                                    className="filter-input"
                                />
                            </div>
                            <div className="filter-group">
                                <input 
                                    type="text" 
                                    placeholder="出發地點..." 
                                    value={filterOrigin} 
                                    onChange={(e) => setFilterOrigin(e.target.value)}
                                    className="filter-input"
                                />
                            </div>
                        </div>
                        <div className="carpool-list">
                            {filteredCarpools.length > 0 ? (
                                filteredCarpools.map(trip => (
                                    <CarpoolCard
                                        key={trip.id}
                                        trip={trip}
                                        onContact={handleContact}
                                        onEdit={handleEdit}
                                        onDelete={(id) => setConfirmDeleteId(id)}
                                    />
                                ))
                            ) : (
                                <div className="no-results">找不到符合條件的共乘</div>
                            )}
                        </div>
                    </>
                )}
                {!showForm && (
                    <button onClick={() => setShowForm(true)} className="fab-create-carpool">
                        <Plus size={32} />
                    </button>
                )}
            </div>
            <ConfirmationDialog
                isOpen={!!confirmDeleteId}
                onClose={() => setConfirmDeleteId(null)}
                onConfirm={handleDeleteConfirm}
                title="確認刪除"
                message="您確定要刪除這筆共乘資訊嗎？"
            />
        </Modal>
    );
};

const AccommodationModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    accommodations: AccommodationListing[];
    setAccommodations: React.Dispatch<React.SetStateAction<AccommodationListing[]>>;
    conversations: Conversation[];
    setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
    navigateTo: (screen: Screen) => void;
}> = ({ isOpen, onClose, accommodations, setAccommodations, conversations, setConversations, navigateTo }) => {
    const [showForm, setShowForm] = useState(false);
    const [editingListing, setEditingListing] = useState<AccommodationListing | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Filter states
    const [filterFestival, setFilterFestival] = useState('');
    const [filterAddress, setFilterAddress] = useState('');
    const [minPrice, setMinPrice] = useState('');
    const [maxPrice, setMaxPrice] = useState('');

    const filteredAccommodations = useMemo(() => {
        return accommodations.filter(listing => {
            const matchFestival = !filterFestival || listing.festivalName.toLowerCase().includes(filterFestival.toLowerCase());
            const matchAddress = !filterAddress || listing.address.toLowerCase().includes(filterAddress.toLowerCase());
            const matchMinPrice = !minPrice || listing.pricePerNight >= parseInt(minPrice);
            const matchMaxPrice = !maxPrice || listing.pricePerNight <= parseInt(maxPrice);
            return matchFestival && matchAddress && matchMinPrice && matchMaxPrice;
        });
    }, [accommodations, filterFestival, filterAddress, minPrice, maxPrice]);

    const handleContact = (listing: AccommodationListing) => {
        const conversationId = `accommodation-${listing.id}`;
        const existingConv = conversations.find(c => c.id === conversationId);
        
        if (!existingConv) {
            const newConv: Conversation = {
                id: conversationId,
                participant: { name: listing.host.name, initials: listing.host.initials },
                topic: `${listing.festivalName}住宿`,
                messages: [
                    { id: `m${Date.now()}`, text: `你好，我想詢問關於 ${listing.festivalName} 的住宿！`, sender: 'user', timestamp: new Date() }
                ]
            };
            setConversations([newConv, ...conversations]);
        }
        
        onClose();
        navigateTo('messages', conversationId);
    };

    const handleFormSubmit = (listingData: Omit<AccommodationListing, 'id' | 'host' | 'position'>) => {
        if (editingListing) {
            setAccommodations(accommodations.map(l => l.id === editingListing.id ? { ...editingListing, ...listingData } : l));
        } else {
            const newListing: AccommodationListing = {
                ...listingData,
                id: `a${Date.now()}`,
                host: { name: 'User', initials: 'U' },
            };
            setAccommodations([newListing, ...accommodations]);
        }
        setShowForm(false);
        setEditingListing(null);
    };

    const handleEdit = (listing: AccommodationListing) => {
        setEditingListing(listing);
        setShowForm(true);
    };

    const handleDeleteConfirm = () => {
        if (confirmDeleteId) {
            setAccommodations(accommodations.filter(l => l.id !== confirmDeleteId));
            setConfirmDeleteId(null);
        }
    };
    
    const handleBack = () => {
        if (showForm) {
            setShowForm(false);
            setEditingListing(null);
        } else {
            onClose();
        }
    };

    const header = (
        <header className="modal-header">
            <button onClick={handleBack} className="modal-back-button">&lt; Back</button>
            <h2 className="modal-title">{showForm ? (editingListing ? '編輯住宿' : '新增住宿') : '住宿'}</h2>
            <div className="modal-header-placeholder"></div>
        </header>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} headerContent={header} fullscreen className="accommodation-modal">
            <div className="modal-feature-container accommodation-feature-container">
                {showForm ? (
                     <div className="form-wrapper">
                        <CreateAccommodationForm
                            onSubmit={handleFormSubmit}
                            isEditing={!!editingListing}
                            initialData={editingListing || undefined}
                        />
                    </div>
                ) : (
                    <>
                        <div className="list-filters">
                            <div className="filter-row">
                                <input 
                                    type="text" 
                                    placeholder="搜尋音樂祭..." 
                                    value={filterFestival} 
                                    onChange={(e) => setFilterFestival(e.target.value)}
                                    className="filter-input"
                                />
                                <input 
                                    type="text" 
                                    placeholder="地點..." 
                                    value={filterAddress} 
                                    onChange={(e) => setFilterAddress(e.target.value)}
                                    className="filter-input"
                                />
                            </div>
                            <div className="filter-row">
                                <input 
                                    type="number" 
                                    placeholder="最低價格" 
                                    value={minPrice} 
                                    onChange={(e) => setMinPrice(e.target.value)}
                                    className="filter-input"
                                />
                                <input 
                                    type="number" 
                                    placeholder="最高價格" 
                                    value={maxPrice} 
                                    onChange={(e) => setMaxPrice(e.target.value)}
                                    className="filter-input"
                                />
                            </div>
                        </div>
                        <div className="accommodation-list">
                            {filteredAccommodations.length > 0 ? (
                                filteredAccommodations.map(listing => (
                                    <AccommodationCard
                                        key={listing.id}
                                        listing={listing}
                                        onContact={handleContact}
                                        onEdit={handleEdit}
                                        onDelete={(id) => setConfirmDeleteId(id)}
                                    />
                                ))
                            ) : (
                                <div className="no-results">找不到符合條件的住宿</div>
                            )}
                        </div>
                    </>
                )}
                {!showForm && (
                    <button onClick={() => setShowForm(true)} className="fab-create-carpool">
                        <Plus size={32} />
                    </button>
                )}
            </div>
             <ConfirmationDialog
                isOpen={!!confirmDeleteId}
                onClose={() => setConfirmDeleteId(null)}
                onConfirm={handleDeleteConfirm}
                title="確認刪除"
                message="您確定要刪除這筆住宿資訊嗎？"
            />
        </Modal>
    );
};

const FestivalCard: React.FC<{ festival: Festival; isTicketAdded?: boolean; onAddTicket?: (id: string) => void }> = ({ festival, isTicketAdded, onAddTicket }) => {
    const displayDate = formatDateForDisplay(festival);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importCode, setImportCode] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importSuccess, setImportSuccess] = useState(false);
    const [importError, setImportError] = useState('');

    const handleImport = () => {
        if (!importCode.trim()) {
            setImportError('請輸入有效的訂單編號或取票碼');
            return;
        }
        setImportError('');
        setIsImporting(true);
        
        // Simulate API call to verify external ticket code
        setTimeout(() => {
            setIsImporting(false);
            setImportSuccess(true);
            if (onAddTicket) {
                onAddTicket(festival.id);
            }
            // Close modal after showing success message briefly
            setTimeout(() => {
                setShowImportModal(false);
                setImportSuccess(false);
                setImportCode('');
            }, 2000);
        }, 1500);
    };
    
    const getButton = () => {
        if (festival.isEnded) {
            return <span className="ended-button">活動結束</span>;
        }
        if (festival.isSoldOut) {
            return <span className="sold-out-button">票券完售</span>;
        }
        if (festival.isFree) {
            return <span className="free-admission-button">免費入場</span>;
        }
        return (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                <a href={festival.kktix} target="_blank" rel="noopener noreferrer" className="kktix-button" style={{ marginTop: 0 }}>
                    <Ticket size={16} className="inline-icon" /> 購票連結
                </a>
                {onAddTicket && !isTicketAdded && (
                    <button 
                        className="add-ticket-button"
                        style={{ marginTop: 0, backgroundColor: '#4A90E2' }}
                        onClick={() => setShowImportModal(true)}
                    >
                        <Download size={16} className="inline-icon" /> 
                        匯入已購票券
                    </button>
                )}
                {isTicketAdded && (
                    <button className="add-ticket-button added" style={{ marginTop: 0 }} disabled>
                        <CheckCircle size={16} className="inline-icon" /> 已匯入票券
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="festival-card">
            <h4>{festival.name}</h4>
            <div className="festival-info">
                <p>
                    <Calendar size={14} className="inline-icon" /> 
                    <span className="info-text"><strong>日期:</strong> {displayDate}</span>
                </p>
                <p>
                    <MapPin size={14} className="inline-icon" /> 
                    <span className="info-text"><strong>地點:</strong> {festival.location}</span>
                </p>
            </div>
            <div className="festival-lineup">
                <strong>演出陣容:</strong>
                <p>{festival.lineup}</p>
            </div>
            {festival.transportation && (
                <div className="festival-transportation">
                    <div className="transportation-header">
                        <Bus size={14} className="inline-icon" /> <strong>交通方式</strong>
                    </div>
                    <div className="transportation-content">
                        {festival.transportation.split('\n').map((line, index) => {
                            const trimmedLine = line.trim();
                            if (trimmedLine === '') return <p key={index} className="empty-line"></p>;
                            const isBullet = trimmedLine.startsWith('•');
                            return (
                                <p key={index} className={isBullet ? 'bullet-line' : 'normal-line'}>
                                    {line}
                                </p>
                            );
                        })}
                    </div>
                </div>
            )}
            {getButton()}

            {showImportModal && (
                <div className="modal-overlay" onClick={() => !isImporting && setShowImportModal(false)}>
                    <div className="modal-content purchase-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>匯入已購票券</h3>
                            <button className="close-button" onClick={() => setShowImportModal(false)} disabled={isImporting}>
                                <X size={20} />
                            </button>
                        </div>
                        
                        {importSuccess ? (
                            <div className="purchase-success-content" style={{ textAlign: 'center', padding: '2rem 0' }}>
                                <CheckCircle size={48} color="#5D806A" style={{ margin: '0 auto 1rem' }} />
                                <h4>匯入成功！</h4>
                                <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>您的電子票券已發送至「個人」頁面。</p>
                            </div>
                        ) : (
                            <div className="purchase-details">
                                <div className="purchase-item-info" style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--bg-main)', borderRadius: '8px' }}>
                                    <h4 style={{ marginBottom: '0.5rem' }}>{festival.name}</h4>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}><Calendar size={14} className="inline-icon" /> {displayDate}</p>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}><MapPin size={14} className="inline-icon" /> {festival.location}</p>
                                </div>
                                
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>請輸入訂單編號或取票碼</label>
                                    <input 
                                        type="text" 
                                        value={importCode}
                                        onChange={(e) => setImportCode(e.target.value)}
                                        placeholder="例如：TICKET-12345678"
                                        style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)' }}
                                    />
                                    {importError && <p style={{ color: 'var(--destructive)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{importError}</p>}
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                                        <Info size={12} className="inline-icon" /> 您可以在購票平台的「我的票券」中找到訂單編號。
                                    </p>
                                </div>

                                <button 
                                    className="primary-button" 
                                    onClick={handleImport}
                                    disabled={isImporting}
                                    style={{ width: '100%', padding: '0.8rem', backgroundColor: '#4A90E2' }}
                                >
                                    {isImporting ? '驗證中...' : '確認匯入'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- App Entry Point ---
const App: React.FC = () => {
    const [screen, setScreen] = useState<Screen>('apiKey');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [apiKey, setApiKey] = useState<string | null>(localStorage.getItem('googleMapsApiKey'));
    const [isScriptLoading, setIsScriptLoading] = useState(false);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);
    const [scriptLoadError, setScriptLoadError] = useState(false);
    const [conversations, setConversations] = useState<Conversation[]>(conversationsData);
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
    const [carpools, setCarpools] = useState<CarpoolTrip[]>(carpoolData);
    const [accommodations, setAccommodations] = useState<AccommodationListing[]>(accommodationData);
    
    const [userSchedule, setUserSchedule] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('userSchedule');
            if (!saved) return new Set();
            const parsed = JSON.parse(saved);
            return Array.isArray(parsed) ? new Set(parsed) : new Set();
        } catch (e) {
            console.error("Failed to parse userSchedule", e);
            return new Set();
        }
    });

    const [myTickets, setMyTickets] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('myTickets');
            if (!saved) return [];
            const parsed = JSON.parse(saved);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error("Failed to parse myTickets", e);
            return [];
        }
    });

    const handleAddTicket = (festivalId: string) => {
        setMyTickets(prev => {
            if (prev.includes(festivalId)) return prev;
            const next = [...prev, festivalId];
            localStorage.setItem('myTickets', JSON.stringify(next));
            return next;
        });
    };
     
    const navigateTo = (newScreen: Screen, conversationId?: string) => {
        if (conversationId) {
            setSelectedConversationId(conversationId);
        }
        if (newScreen === 'home' && !isLoggedIn) {
            setScreen('auth');
        } else {
            setScreen(newScreen);
        }
    };
    
    const handleLogin = () => {
        setIsLoggedIn(true);
        navigateTo('home');
    };

    const handleLogout = () => {
        setIsLoggedIn(false);
        setScreen('auth');
    };
    
    const handleApiKeySaved = (key: string) => {
        localStorage.setItem('googleMapsApiKey', key);
        setApiKey(key);
        setScriptLoadError(false);
        setScreen(isLoggedIn ? 'home' : 'welcome');
    };

    const handleToggleSchedule = (performanceId: string) => {
        setUserSchedule(prev => {
            const newSchedule = new Set(prev);
            if (newSchedule.has(performanceId)) {
                newSchedule.delete(performanceId);
            } else {
                newSchedule.add(performanceId);
            }
            localStorage.setItem('userSchedule', JSON.stringify(Array.from(newSchedule)));
            return newSchedule;
        });
    };
    
    // Check if script is already loaded (e.g. from previous session)
    useEffect(() => {
        if (window.google && window.google.maps) {
            setIsScriptLoaded(true);
        }
    }, []);

    const loadGoogleMapsScript = useCallback((key: string) => {
        if (isScriptLoaded || isScriptLoading || (window.google && !scriptLoadError)) return;

        setIsScriptLoading(true);
        setScriptLoadError(false);

        // Clean up any existing script tags to allow reloading
        const existingScripts = document.querySelectorAll('script[src^="https://maps.googleapis.com/maps/api/js"]');
        existingScripts.forEach(s => s.remove());

        window.gm_authFailure = () => {
            console.error("Google Maps API Authentication Failure.");
            alert("Google Maps API 金鑰無效或已過期，請重新輸入。");
            localStorage.removeItem('googleMapsApiKey');
            setApiKey(null);
            setIsScriptLoaded(false);
            setIsScriptLoading(false);
            setScriptLoadError(true);
            
            // Clean up global variables so we can try again
            delete window.google;
            
            // Delay unmounting the screen to prevent IntersectionObserver error from Google Maps API
            setTimeout(() => {
                setScreen('apiKey');
            }, 500);
        };

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key.trim())}&libraries=places&callback=initMap`;
        script.async = true;
        script.defer = true;
        
        window.initMap = () => {
            console.log("Google Maps script loaded successfully.");
            setIsScriptLoaded(true);
            setIsScriptLoading(false);
            setScriptLoadError(false);
        };
        
        script.onerror = () => {
            console.error("Failed to load Google Maps script.");
            setIsScriptLoading(false);
            setScriptLoadError(true); // Stop infinite retry loop
            alert("無法載入 Google Maps 腳本，可能是網路問題或金鑰錯誤。");
        };

        document.head.appendChild(script);
        
    }, [isScriptLoaded, isScriptLoading, scriptLoadError]);
    
    useEffect(() => {
        if (apiKey && !isScriptLoaded && !isScriptLoading && !scriptLoadError) {
            loadGoogleMapsScript(apiKey);
        }
    }, [apiKey, isScriptLoaded, isScriptLoading, scriptLoadError, loadGoogleMapsScript]);

    const renderScreen = () => {
        switch (screen) {
            case 'apiKey':
                return <ApiKeyScreen onKeySaved={handleApiKeySaved} />;
            case 'welcome':
                return <WelcomeScreen onWelcome={() => navigateTo('auth')} />;
            case 'auth':
                return <AuthScreen onLogin={handleLogin} />;
            case 'home':
                return (
                    <HomeScreen 
                        navigateTo={navigateTo} 
                        userSchedule={userSchedule} 
                        onToggleSchedule={handleToggleSchedule}
                        conversations={conversations}
                        setConversations={setConversations}
                        carpools={carpools}
                        setCarpools={setCarpools}
                        accommodations={accommodations}
                        setAccommodations={setAccommodations}
                        myTickets={myTickets}
                        onAddTicket={handleAddTicket}
                    />
                );
            case 'profile':
                 return <ProfileScreen navigateTo={navigateTo} onLogout={handleLogout} myTickets={myTickets} />;
            case 'messages':
                return (
                    <MessagesScreen 
                        navigateTo={navigateTo} 
                        conversations={conversations}
                        setConversations={setConversations}
                        initialSelectedId={selectedConversationId}
                        onClearInitialId={() => setSelectedConversationId(null)}
                        carpools={carpools}
                        accommodations={accommodations}
                    />
                );
            default:
                return <div>Loading...</div>;
        }
    };

    return (
        <div className="app-container">
            {renderScreen()}
        </div>
    );
};

const HomeScreen: React.FC<{ 
    navigateTo: (screen: Screen) => void;
    userSchedule: Set<string>;
    onToggleSchedule: (id: string) => void; 
    conversations: Conversation[];
    setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
    carpools: CarpoolTrip[];
    setCarpools: React.Dispatch<React.SetStateAction<CarpoolTrip[]>>;
    accommodations: AccommodationListing[];
    setAccommodations: React.Dispatch<React.SetStateAction<AccommodationListing[]>>;
    myTickets: string[];
    onAddTicket: (id: string) => void;
}> = ({ navigateTo, userSchedule, onToggleSchedule, conversations, setConversations, carpools, setCarpools, accommodations, setAccommodations, myTickets, onAddTicket }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isAnnouncementsOpen, setIsAnnouncementsOpen] = useState(false);
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [isCarpoolModalOpen, setIsCarpoolModalOpen] = useState(false);
    const [isAccommodationModalOpen, setIsAccommodationModalOpen] = useState(false);
    
    // FIX: Use primitive year/month state instead of Date object for reliable updates
    const [viewState, setViewState] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });

    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [isDailyPlannerOpen, setIsDailyPlannerOpen] = useState(false);
    
    const [isTimetableModalOpen, setIsTimetableModalOpen] = useState(false);
    const [isUserTimetableModalOpen, setIsUserTimetableModalOpen] = useState(false);
    const [timetableData, setTimetableData] = useState<{ festival: Festival; date: Date } | null>(null);
    const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
    const [isBannerDismissed, setIsBannerDismissed] = useState(false);
    const [notifiedEvents, setNotifiedEvents] = useState<Set<string>>(new Set());

    const [customSchedules, setCustomSchedules] = useState<CustomSchedules>(() => {
        try {
            const saved = localStorage.getItem('customSchedules');
            if (!saved) return {};
            const parsed = JSON.parse(saved);
            return (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) ? parsed : {};
        } catch (e) {
            console.error("Failed to parse customSchedules", e);
            return {};
        }
    });

    const filteredFestivals = useMemo(() => {
        if (!searchQuery) {
            return [];
        }
    
        const lowerCaseQuery = searchQuery.toLowerCase();
        
        if (['北部', '中部', '南部'].includes(searchQuery)) {
            const regionKeywords: { [key: string]: string[] } = {
                '北部': ['台北', '臺北', '新北', '基隆', '桃園', '新竹', '宜蘭'],
                '中部': ['台中', '臺中', '苗栗', '彰化', '南投', '雲林'],
                '南部': ['嘉義', '台南', '臺南', '高雄', '屏東', '台東', '臺東'],
            };
            const keywords = regionKeywords[searchQuery];
            return festivalsData.filter(f => keywords.some(kw => f.location.includes(kw)));
        }
    
        if (searchQuery === '免費') {
            return festivalsData.filter(f => f.isFree);
        }
    
        if (searchQuery === '熱賣中') {
            return festivalsData.filter(f => !f.isSoldOut && !f.isEnded && !f.isFree);
        }
        
        return festivalsData.filter(f => {
            if (f.name.toLowerCase().includes(lowerCaseQuery) ||
                f.lineup.toLowerCase().includes(lowerCaseQuery) ||
                f.location.toLowerCase().includes(lowerCaseQuery)) {
                return true;
            }
            
            // Check timetable data for artist names
            const festivalTimetable = timetablesData[f.id];
            if (festivalTimetable) {
                for (const date in festivalTimetable) {
                    const stages = festivalTimetable[date];
                    for (const stage in stages) {
                        const performances = stages[stage];
                        if (performances.some(p => p.artist.toLowerCase().includes(lowerCaseQuery))) {
                            return true;
                        }
                    }
                }
            }
            
            return false;
        });
    }, [searchQuery]);

    const festivalsWithDates = useMemo(() => {
        return festivalsData.map(festival => ({
            ...festival,
            ...parseDateRange(festival)
        }));
    }, []);

    const daysInMonth = useMemo(() => {
        const date = new Date(viewState.year, viewState.month, 1);
        const days = [];
        while (date.getMonth() === viewState.month) {
            days.push(new Date(date));
            date.setDate(date.getDate() + 1);
        }
        return days;
    }, [viewState.year, viewState.month]);
    
    const startDayOfWeek = useMemo(() => {
        return new Date(viewState.year, viewState.month, 1).getDay();
    }, [viewState.year, viewState.month]);
    
    const handleDayClick = (day: Date) => {
        setSelectedDate(day);
        setIsDailyPlannerOpen(true);
    };

    const handleUpdateSchedule = (schedule: { title: string; items: CustomScheduleItem[] }) => {
        const dateKey = selectedDate.toLocaleDateString('en-CA');
        const updatedSchedules = {...customSchedules, [dateKey]: schedule};
        setCustomSchedules(updatedSchedules);
        localStorage.setItem('customSchedules', JSON.stringify(updatedSchedules));
    };

    const todayEvents = useMemo(() => {
        const today = new Date();
        const todayKey = getDateKey(today);
        const todayEnCa = today.toLocaleDateString('en-CA');

        const officialItems = [...userSchedule]
            .filter(id => id.includes(`||${todayKey}||`))
            .map(id => {
                const [festivalId, , stageName, time, artist] = id.split('||');
                const festival = festivalsData.find(f => f.id === festivalId);
                return {
                    id,
                    time,
                    activity: artist,
                    stage: stageName,
                    festivalName: festival?.name || '',
                    isOfficial: true
                };
            });

        const customItems = (customSchedules[todayEnCa]?.items || []).map(item => ({
            ...item,
            isOfficial: false
        }));

        return [...officialItems, ...customItems].sort((a, b) => a.time.localeCompare(b.time));
    }, [userSchedule, customSchedules]);

    // Request browser notification permission and setup interval
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const checkUpcomingEvents = () => {
            if ('Notification' in window && Notification.permission === 'granted') {
                const now = new Date();
                const currentHour = now.getHours();
                const currentMinute = now.getMinutes();
                const currentTimeInMinutes = currentHour * 60 + currentMinute;

                todayEvents.forEach(event => {
                    // Parse event time (assuming format "HH:mm")
                    const timeMatch = event.time.match(/(\d{1,2}):(\d{2})/);
                    if (timeMatch) {
                        const eventHour = parseInt(timeMatch[1], 10);
                        const eventMinute = parseInt(timeMatch[2], 10);
                        const eventTimeInMinutes = eventHour * 60 + eventMinute;

                        // Check if event is starting in exactly 15 minutes
                        const timeDiff = eventTimeInMinutes - currentTimeInMinutes;
                        if (timeDiff > 0 && timeDiff <= 15 && !notifiedEvents.has(event.id)) {
                            new Notification('行程提醒', {
                                body: `您的行程「${event.activity}」將在 15 分鐘後（${event.time}）開始！`,
                                icon: '/favicon.ico' // Assuming a default favicon exists
                            });
                            setNotifiedEvents(prev => new Set(prev).add(event.id));
                        }
                    }
                });
            }
        };

        // Check immediately and then every minute
        checkUpcomingEvents();
        const intervalId = setInterval(checkUpcomingEvents, 60000);

        return () => clearInterval(intervalId);
    }, [todayEvents, notifiedEvents]);

    const handleShowTimetable = (type: 'official' | 'user', festival: Festival, date: Date) => {
        setTimetableData({ festival, date });
        if (type === 'official') {
            setIsTimetableModalOpen(true);
        } else {
            setIsUserTimetableModalOpen(true);
        }
        setIsDailyPlannerOpen(false); // Close planner when opening timetable
    };

    const festivalsByDay = useMemo(() => {
        const map = new Map<string, FestivalWithDates[]>();
        festivalsWithDates.forEach(fest => {
            if (isNaN(fest.start.getTime()) || isNaN(fest.end.getTime())) {
                console.warn(`Invalid date for festival: ${fest.name}`);
                return;
            }
            let currentDate = new Date(fest.start);
            while (currentDate <= fest.end) {
                const dateString = currentDate.toDateString();
                const existing = map.get(dateString) || [];
                map.set(dateString, [...existing, fest]);
                currentDate.setDate(currentDate.getDate() + 1);
            }
        });
        return map;
    }, [festivalsWithDates]);
    
    const getFestivalsForDay = (day: Date) => {
        return festivalsByDay.get(day.toDateString()) || [];
    };

     const changeMonth = (offset: number) => {
        setViewState(prev => {
            let newMonth = prev.month + offset;
            let newYear = prev.year;
            
            if (newMonth > 11) {
                newMonth = 0;
                newYear += 1;
            } else if (newMonth < 0) {
                newMonth = 11;
                newYear -= 1;
            }
            return { year: newYear, month: newMonth };
        });
    };

    useEffect(() => {
        const isAnyModalOpen = isLocationModalOpen || isAnnouncementsOpen || isCarpoolModalOpen || isAccommodationModalOpen;
        document.body.classList.toggle('no-scroll', isAnyModalOpen);
        return () => {
            document.body.classList.remove('no-scroll');
        };
    }, [isLocationModalOpen, isAnnouncementsOpen, isCarpoolModalOpen, isAccommodationModalOpen]);


    return (
        <div className="main-app-screen">
            <div className="main-content">
                <div className="home-screen">
                    <header className="home-header">
                        <h1 className="logo-small">拾音旅伴</h1>
                        <div className="search-bar-wrapper">
                            <input
                                type="text"
                                placeholder="搜尋音樂祭、樂團..."
                                className="search-bar"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="clear-search-btn">&times;</button>
                            )}
                        </div>
                        <button className="notification-bell" onClick={() => setIsNotificationModalOpen(true)}>
                            <Bell size={24} />
                            {todayEvents.length > 0 && <span className="notification-badge">{todayEvents.length}</span>}
                        </button>
                    </header>
                    
                    {!isBannerDismissed && todayEvents.length > 0 && (
                        <div className="notification-banner">
                            <div className="banner-content">
                                <Bell size={18} className="banner-icon" />
                                <span>您今天有 <strong>{todayEvents.length}</strong> 個行程！</span>
                                <button className="banner-view-btn" onClick={() => setIsNotificationModalOpen(true)}>查看</button>
                            </div>
                            <button className="banner-close-btn" onClick={() => setIsBannerDismissed(true)}><X size={16} /></button>
                        </div>
                    )}

                    <div className="keywords-container">
                        <span className="keywords-title">熱門搜尋:</span>
                        {['北部', '中部', '南部', '免費', '熱賣中'].map(keyword => (
                            <button key={keyword} className="keyword-button" onClick={() => setSearchQuery(keyword)}>
                                {keyword}
                            </button>
                        ))}
                    </div>

                    {searchQuery ? (
                        <div className="search-results-container">
                            {filteredFestivals.length > 0 ? (
                                filteredFestivals.map(fest => <FestivalCard key={fest.id} festival={fest} isTicketAdded={myTickets.includes(fest.id)} onAddTicket={onAddTicket} />)
                            ) : (
                                <p className="no-results">找不到符合條件音樂祭</p>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="action-buttons">
                                <button className="action-button announcements" onClick={() => setIsAnnouncementsOpen(true)}>公告通知</button>
                                <button className="action-button location" onClick={() => setIsLocationModalOpen(true)}>即時位置</button>
                                <button className="action-button carpool" onClick={() => setIsCarpoolModalOpen(true)}>共乘</button>
                                <button className="action-button accommodation" onClick={() => setIsAccommodationModalOpen(true)}>住宿</button>
                            </div>

                            <div className="itinerary-section" id="planner-section">
                                <h3>行程規劃</h3>
                                <div className="calendar">
                                    <div className="calendar-header">
                                        <button type="button" onClick={() => changeMonth(-1)}>&lt;</button>
                                        <span>{viewState.year}年 {viewState.month + 1}月</span>
                                        <button type="button" onClick={() => changeMonth(1)}>&gt;</button>
                                    </div>
                                    <div className="calendar-grid">
                                        {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d} className="day-header">{d}</div>)}
                                        {Array.from({ length: startDayOfWeek }).map((_, i) => <div key={`empty-${i}`} className="day not-current-month"></div>)}
                                        {daysInMonth.map(day => {
                                            const today = new Date();
                                            const isToday = day.toDateString() === today.toDateString();
                                            const festivalsOnDay = getFestivalsForDay(day);
                                            const customSchedule = customSchedules[day.toLocaleDateString('en-CA')];

                                            return (
                                                <div key={day.toISOString()} className={`day ${isToday ? 'today' : ''}`} onClick={() => handleDayClick(day)}>
                                                    <span className="day-number">{day.getDate()}</span>
                                                    <div className="day-festivals">
                                                        {festivalsOnDay.slice(0, 1).map(fest => (
                                                            <div 
                                                                key={fest.id} 
                                                                className="festival-indicator"
                                                                style={{ backgroundColor: getFestivalColor(fest.name) }}
                                                            >
                                                                {fest.name.split(' ')[0]}
                                                            </div>
                                                        ))}
                                                        {customSchedule && customSchedule.title && (
                                                            <div className="custom-schedule-title-indicator">{customSchedule.title}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <BottomNav activeScreen="home" navigateTo={navigateTo} />
            
            <AnnouncementsModal isOpen={isAnnouncementsOpen} onClose={() => setIsAnnouncementsOpen(false)} />
            <LocationModal isOpen={isLocationModalOpen} onClose={() => setIsLocationModalOpen(false)} />
            <CarpoolModal 
                isOpen={isCarpoolModalOpen} 
                onClose={() => setIsCarpoolModalOpen(false)} 
                carpools={carpools}
                setCarpools={setCarpools}
                conversations={conversations}
                setConversations={setConversations}
                navigateTo={navigateTo}
            />
            <AccommodationModal 
                isOpen={isAccommodationModalOpen} 
                onClose={() => setIsAccommodationModalOpen(false)} 
                accommodations={accommodations}
                setAccommodations={setAccommodations}
                conversations={conversations}
                setConversations={setConversations}
                navigateTo={navigateTo}
            />
            
            {selectedDate && (
                <DailyPlannerModal
                    isOpen={isDailyPlannerOpen}
                    onClose={() => setIsDailyPlannerOpen(false)}
                    date={selectedDate}
                    schedule={customSchedules[selectedDate.toLocaleDateString('en-CA')] || { title: '', items: [] }}
                    onUpdateSchedule={handleUpdateSchedule}
                    festivalsOnDay={getFestivalsForDay(selectedDate)}
                    onShowTimetable={handleShowTimetable}
                    userSchedule={userSchedule}
                    onToggleSchedule={onToggleSchedule}
                />
            )}
            {timetableData && (
                <>
                    <TimetableModal 
                        isOpen={isTimetableModalOpen}
                        onClose={() => {setIsTimetableModalOpen(false); setIsDailyPlannerOpen(true);}}
                        data={timetableData}
                        userSchedule={userSchedule}
                        onToggleSchedule={onToggleSchedule}
                    />
                    <UserTimetableModal 
                        isOpen={isUserTimetableModalOpen}
                        onClose={() => {setIsUserTimetableModalOpen(false); setIsDailyPlannerOpen(true);}}
                        data={timetableData}
                        userSchedule={userSchedule}
                        onToggleSchedule={onToggleSchedule}
                    />
                </>
            )}

            <Modal isOpen={isNotificationModalOpen} onClose={() => setIsNotificationModalOpen(false)} title="今日行程通知">
                <div className="notification-content">
                    {todayEvents.length > 0 ? (
                        <div className="today-events-list">
                            <p className="notification-summary">您今天有 {todayEvents.length} 個行程！</p>
                            {todayEvents.map((event, idx) => (
                                <div key={idx} className="notification-item">
                                    <div className="notification-time">{event.time}</div>
                                    <div className="notification-details">
                                        <div className="notification-title">{event.activity}</div>
                                        {event.isOfficial ? (
                                            <div className="notification-subtitle">{event.festivalName} - {event.stage}</div>
                                        ) : (
                                            <div className="notification-subtitle">自訂行程</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="notification-empty">
                            <Bell size={48} color="var(--text-secondary)" style={{ opacity: 0.5, marginBottom: '1rem' }} />
                            <p>今天沒有安排任何行程</p>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};


const ProfileScreen: React.FC<{ navigateTo: (screen: Screen) => void; onLogout: () => void; myTickets: string[]; }> = ({ navigateTo, onLogout, myTickets }) => {
    const [avatar, setAvatar] = useState<string | null>(localStorage.getItem('userAvatar'));
    const [userName, setUserName] = useState(localStorage.getItem('userName') || 'User Name');
    const [isEditingName, setIsEditingName] = useState(false);
    const [tempName, setTempName] = useState(userName);
    const [isCheckingName, setIsCheckingName] = useState(false);
    const [nameError, setNameError] = useState<string | null>(null);
    const [isNameAvailable, setIsNameAvailable] = useState<boolean | null>(null);
    const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
        return localStorage.getItem('darkMode') === 'true';
    });

    useEffect(() => {
        if (isDarkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        localStorage.setItem('darkMode', isDarkMode.toString());
    }, [isDarkMode]);

    const toggleDarkMode = () => setIsDarkMode(prev => !prev);

    useEffect(() => {
        // Register current username on mount to ensure it's in the server's list
        if (userName) {
            fetch('/api/register-username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: userName })
            }).catch(e => console.error('Initial registration failed', e));
        }
    }, []);

    const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>(() => {
        try {
            const saved = localStorage.getItem('archiveItems');
            if (!saved) return [];
            const parsed = JSON.parse(saved);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error("Failed to parse archiveItems", e);
            return [];
        }
    });
    
    // States for modals
    const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
    const [isCropperOpen, setIsCropperOpen] = useState(false);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
    const [activeMemory, setActiveMemory] = useState<ArchiveItem | null>(null);
    const [isEditingMemory, setIsEditingMemory] = useState(false);
    
    // Cropper states
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAvatarClick = () => setIsActionSheetOpen(true);
    const handleEditName = () => {
        setTempName(userName);
        setIsEditingName(true);
        setNameError(null);
        setIsNameAvailable(null);
    };

    // Debounced username check
    useEffect(() => {
        if (!isEditingName) return;
        
        const timer = setTimeout(async () => {
            const trimmed = tempName.trim();
            if (!trimmed || trimmed === userName) {
                setIsNameAvailable(null);
                setNameError(null);
                return;
            }

            setIsCheckingName(true);
            try {
                const response = await fetch(`/api/check-username?username=${encodeURIComponent(trimmed)}`);
                const data = await response.json();
                setIsNameAvailable(data.available);
                if (!data.available) {
                    setNameError('此名字已被使用');
                } else {
                    setNameError(null);
                }
            } catch (error) {
                console.error('Error checking username:', error);
            } finally {
                setIsCheckingName(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [tempName, isEditingName, userName]);

    const handleSaveName = async () => {
        const newName = tempName.trim();
        if (!newName) {
            setNameError('名字不能為空');
            return;
        }

        if (newName === userName) {
            setIsEditingName(false);
            return;
        }

        if (isNameAvailable === false) {
            return;
        }

        setIsCheckingName(true);
        try {
            const registerResponse = await fetch('/api/register-username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: newName, oldUsername: userName })
            });

            if (registerResponse.ok) {
                setUserName(newName);
                localStorage.setItem('userName', newName);
                setIsEditingName(false);
            } else {
                const errData = await registerResponse.json();
                setNameError(errData.error || '註冊名字失敗');
            }
        } catch (error) {
            console.error('Failed to save username', error);
            // Fallback for demo
            setUserName(newName);
            localStorage.setItem('userName', newName);
            setIsEditingName(false);
        } finally {
            setIsCheckingName(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                setImageSrc(reader.result as string);
                setIsCropperOpen(true);
                setIsActionSheetOpen(false);
            });
            reader.readAsDataURL(file);
        }
    };
    
    const getCroppedImg = (imageSrc: string, pixelCrop: Area): Promise<string> => {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.src = imageSrc;
            image.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas context is not available.'));
                    return;
                }

                canvas.width = pixelCrop.width;
                canvas.height = pixelCrop.height;
                
                ctx.drawImage(
                    image,
                    pixelCrop.x,
                    pixelCrop.y,
                    pixelCrop.width,
                    pixelCrop.height,
                    0,
                    0,
                    pixelCrop.width,
                    pixelCrop.height
                );
                
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };
            image.onerror = (e) => reject(e);
        });
    };

    const handleDeleteAvatar = () => {
        setAvatar(null);
        localStorage.removeItem('userAvatar');
        setIsActionSheetOpen(false);
    };

    const showCroppedImage = async () => {
        if (imageSrc && croppedAreaPixels) {
            const croppedImageUrl = await getCroppedImg(imageSrc, croppedAreaPixels);
            setAvatar(croppedImageUrl);
            localStorage.setItem('userAvatar', croppedImageUrl);
            setIsCropperOpen(false);
        }
    };
    
    const handleSaveMemory = (memory: ArchiveItem) => {
        setArchiveItems(prev => {
            const existingIndex = prev.findIndex(item => item.id === memory.id);
            let newItems;
            if (existingIndex > -1) {
                newItems = [...prev];
                newItems[existingIndex] = memory;
            } else {
                newItems = [memory, ...prev];
            }
            localStorage.setItem('archiveItems', JSON.stringify(newItems));
            return newItems;
        });
        setIsMemoryModalOpen(false);
        setActiveMemory(null);
        setIsEditingMemory(false);
    };
    
    const handleDeleteMemory = (id: string) => {
        setArchiveItems(prev => {
            const newItems = prev.filter(item => item.id !== id);
            localStorage.setItem('archiveItems', JSON.stringify(newItems));
            return newItems;
        });
        setIsMemoryModalOpen(false);
        setActiveMemory(null);
    }
    
    return (
        <div className="main-app-screen">
            <div className="main-content">
                <div className="profile-screen">
                     <div className="profile-header">
                        <button className="avatar-button" onClick={handleAvatarClick}>
                            {avatar ? (
                                <img src={avatar} alt="User Avatar" className="avatar-image"/>
                            ) : (
                                <div className="avatar-placeholder">
                                    <svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 0 24 24" width="48px" fill="currentColor">
                                        <path d="M0 0h24v24H0V0z" fill="none"/>
                                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                                    </svg>
                                    <div className="avatar-add-badge">
                                        <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="white">
                                            <path d="M0 0h24v24H0V0z" fill="none"/>
                                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                                        </svg>
                                    </div>
                                </div>
                            )}
                        </button>
                        <div className="name-container">
                            {!isEditingName ? (
                                <div className="name-display">
                                    <h2>{userName}</h2>
                                    <button onClick={handleEditName} className="name-action-button" aria-label="Edit name">
                                        <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="#6B7280"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                                    </button>
                                </div>
                            ) : (
                                <div className="name-editor-container">
                                    <div className="name-editor">
                                        <div className="input-with-status">
                                            <input 
                                                type="text" 
                                                value={tempName} 
                                                onChange={(e) => setTempName(e.target.value)} 
                                                className={`name-input ${nameError ? 'has-error' : ''} ${isNameAvailable === true ? 'is-valid' : ''}`} 
                                                autoFocus 
                                                placeholder="輸入名字..."
                                            />
                                            <div className="status-indicator">
                                                {isCheckingName && <div className="spinner-small"></div>}
                                                {!isCheckingName && isNameAvailable === true && (
                                                    <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="#5D806A"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
                                                )}
                                                {!isCheckingName && isNameAvailable === false && (
                                                    <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="#c15130"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
                                                )}
                                            </div>
                                        </div>
                                        <div className="editor-actions">
                                            <button 
                                                onClick={handleSaveName} 
                                                className="name-action-button save" 
                                                aria-label="Save name"
                                                disabled={isCheckingName || isNameAvailable === false}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
                                            </button>
                                            <button 
                                                onClick={() => setIsEditingName(false)} 
                                                className="name-action-button cancel" 
                                                aria-label="Cancel"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="#9CA3AF"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
                                            </button>
                                        </div>
                                    </div>
                                    {nameError && <div className="name-error-message">{nameError}</div>}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="my-tickets-section">
                        <div className="digital-archive-header">
                            <h3>我的電子票券</h3>
                        </div>
                        {myTickets.length > 0 ? (
                            <div className="tickets-list">
                                {myTickets.map(ticketId => {
                                    const festival = festivalsData.find(f => f.id === ticketId);
                                    if (!festival) return null;
                                    return (
                                        <div key={ticketId} className="e-ticket-card">
                                            <div className="ticket-header">
                                                <h4>{festival.name}</h4>
                                                <span className="ticket-status">已領取</span>
                                            </div>
                                            <div className="ticket-body">
                                                <div className="ticket-info">
                                                    <p><Calendar size={14} className="inline-icon" /> {festival.dates}</p>
                                                    <p><MapPin size={14} className="inline-icon" /> {festival.location}</p>
                                                </div>
                                                <div className="ticket-barcode">
                                                    <div className="barcode-lines"></div>
                                                    <span className="barcode-number">{festival.id}-{Math.floor(Math.random() * 100000).toString().padStart(5, '0')}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="archive-empty">尚未領取任何票券</div>
                        )}
                    </div>

                    <div className="digital-archive">
                        <div className="digital-archive-header">
                            <h3>memories</h3>
                            <button onClick={() => { setActiveMemory(null); setIsEditingMemory(true); setIsMemoryModalOpen(true); }} className="add-memory-btn" aria-label="Add new memory">+</button>
                        </div>
                        {archiveItems.length > 0 ? (
                            <div className="archive-grid">
                                {archiveItems.map(item => (
                                    <div key={item.id} className="archive-item" onClick={() => { setActiveMemory(item); setIsEditingMemory(false); setIsMemoryModalOpen(true); }}>
                                        <img src={item.media[0].url} alt={item.title} />
                                         {item.media.length > 1 && (
                                            <div className="media-indicator multi-icon">
                                                <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 0 24 24" width="16px" fill="#FFFFFF"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>
                                            </div>
                                        )}
                                        {item.media[0].type === 'video' && (
                                            <div className="media-indicator">
                                                <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 0 24 24" width="16px" fill="#FFFFFF"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M10 8.64L15.27 12 10 15.36V8.64M8 5v14l11-7L8 5z"/></svg>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="archive-empty">還沒有回憶，新增一個吧！</div>
                        )}
                    </div>
                    
                    <div className="settings-section">
                        <div className="setting-item">
                            <span className="setting-label">深夜模式</span>
                            <label className="toggle-switch">
                                <input 
                                    type="checkbox" 
                                    checked={isDarkMode} 
                                    onChange={toggleDarkMode} 
                                />
                                <span className="toggle-slider"></span>
                            </label>
                        </div>
                    </div>

                    <button className="logout-button" onClick={onLogout}>登出</button>
                </div>
            </div>

            <BottomNav activeScreen="profile" navigateTo={navigateTo} />
            
            <input type="file" accept="image/*" id="avatarInput" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />

            {isActionSheetOpen && (
                <div className="action-sheet-overlay" onClick={() => setIsActionSheetOpen(false)}>
                    <div className="action-sheet" onClick={e => e.stopPropagation()}>
                        <div className="action-sheet-group">
                            <button className="action-sheet-button" onClick={() => fileInputRef.current?.click()}>從相簿選擇</button>
                            {avatar && (
                                <button className="action-sheet-button delete" onClick={handleDeleteAvatar}>刪除目前頭像</button>
                            )}
                        </div>
                        <div className="action-sheet-group">
                            <button className="action-sheet-button cancel" onClick={() => setIsActionSheetOpen(false)}>取消</button>
                        </div>
                    </div>
                </div>
            )}
            
            <Modal isOpen={isCropperOpen} onClose={() => setIsCropperOpen(false)} title="裁切頭像" fullscreen>
                <div className="avatar-cropper-body">
                    <div className="cropper-container">
                        {imageSrc && (
                            <Cropper
                                image={imageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                cropShape="round"
                                showGrid={false}
                                onCropChange={setCrop}
                                onZoomChange={setZoom}
                                onCropComplete={(_, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
                            />
                        )}
                    </div>
                    <div className="cropper-controls">
                        <div className="slider-container">
                            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/><path d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z"/></svg>
                            <input
                                type="range"
                                value={zoom}
                                min={1}
                                max={3}
                                step={0.1}
                                aria-labelledby="Zoom"
                                onChange={(e) => setZoom(Number(e.target.value))}
                            />
                            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/><path d="M7 9h5v1H7z"/></svg>
                        </div>
                        <div className="cropper-actions">
                            <button className="cropper-btn-cancel" onClick={() => setIsCropperOpen(false)}>取消</button>
                            <button className="cropper-btn-save" onClick={showCroppedImage}>完成</button>
                        </div>
                    </div>
                </div>
            </Modal>
            
            {(isMemoryModalOpen) && (
                 <MemoryModal
                    isOpen={isMemoryModalOpen}
                    onClose={() => {setIsMemoryModalOpen(false); setActiveMemory(null);}}
                    memory={activeMemory}
                    isEditingDefault={isEditingMemory}
                    onSave={handleSaveMemory}
                    onDelete={handleDeleteMemory}
                 />
            )}
        </div>
    );
};

const MemoryModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    memory: ArchiveItem | null;
    isEditingDefault: boolean;
    onSave: (memory: ArchiveItem) => void;
    onDelete: (id: string) => void;
}> = ({ isOpen, onClose, memory, isEditingDefault, onSave, onDelete }) => {
    const [isEditing, setIsEditing] = useState(isEditingDefault);
    const [currentMemory, setCurrentMemory] = useState<Partial<ArchiveItem>>(
        memory || { id: `mem-${Date.now()}`, media: [], title: '', description: '' }
    );
    const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
    const mediaInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setIsEditing(isEditingDefault);
        setCurrentMemory(memory || { id: `mem-${Date.now()}`, media: [], title: '', description: '' });
        setCurrentMediaIndex(0);
    }, [isOpen, memory, isEditingDefault]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setCurrentMemory(prev => ({ ...prev, [name]: value }));
    };
    
    const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { files } = e.target;
        if (!files) return;

        const filesArray = Array.from(files);
        
        // Fix: Explicitly type `file` as `File` to resolve type inference issues where it was treated as `unknown`, causing errors on `file.type` and when passing it to `readAsDataURL`.
        const fileReadPromises = filesArray.map((file: File) => {
            return new Promise<MediaItem>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                     const newMedia: MediaItem = {
                        id: `media-${Date.now()}-${Math.random()}`,
                        type: file.type.startsWith('image/') ? 'image' : 'video',
                        url: reader.result as string
                    };
                    resolve(newMedia);
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        });

        Promise.all(fileReadPromises)
            .then(newMediaItems => {
                setCurrentMemory(prev => ({
                    ...prev,
                    media: [...(prev.media || []), ...newMediaItems]
                }));
            })
            .catch(error => {
                console.error("Error reading files:", error);
                alert("讀取檔案時發生錯誤。");
            });
    };
    
    const removeMedia = (index: number) => {
        setCurrentMemory(prev => ({
            ...prev,
            media: (prev.media || []).filter((_, i) => i !== index)
        }));
    };
    
    const handleSaveClick = () => {
        if (!currentMemory.title?.trim() || !currentMemory.media || currentMemory.media.length === 0) {
            alert('請新增標題和至少一張照片 or 影片。');
            return;
        }
        onSave(currentMemory as ArchiveItem);
    };

    const headerContent = (
        <header className="modal-header">
            {isEditing ? (
                 <>
                    <button onClick={onClose} className="modal-back-button">取消</button>
                    <h2 className="modal-title">{memory ? '編輯回憶' : '新增回憶'}</h2>
                    <button onClick={handleSaveClick} className="modal-back-button">儲存</button>
                 </>
            ) : (
                <>
                    <button onClick={onClose} className="modal-back-button">&lt; Back</button>
                    <h2 className="modal-title">回憶</h2>
                    <div style={{display: 'flex', gap: '1rem'}}>
                        <button onClick={() => setIsEditing(true)} className="modal-back-button">編輯</button>
                        <button onClick={() => onDelete(memory!.id)} className="modal-back-button" style={{color: '#c15130'}}>刪除</button>
                    </div>
                </>
            )}
        </header>
    );
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} headerContent={headerContent} fullscreen>
            {isEditing ? (
                <div className="memory-form">
                    <input type="file" ref={mediaInputRef} onChange={handleMediaUpload} multiple accept="image/*,video/*" style={{ display: 'none' }} />
                    <div className="memory-media-grid">
                        {(currentMemory.media || []).map((media, index) => (
                            <div key={media.id} className="memory-media-item">
                                {media.type === 'image' ? <img src={media.url} alt="Memory item" /> : <video src={media.url} />}
                                <button onClick={() => removeMedia(index)} className="remove-media-btn">&times;</button>
                            </div>
                        ))}
                        <button onClick={() => mediaInputRef.current?.click()} className="add-media-btn">+</button>
                    </div>
                    <div className="form-group">
                        <label className="form-label">標題</label>
                        <input type="text" name="title" value={currentMemory.title} onChange={handleInputChange} className="form-input" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">描述</label>
                        <textarea name="description" value={currentMemory.description} onChange={handleInputChange} className="form-input" rows={4}></textarea>
                    </div>
                </div>
            ) : (
                <div className="memory-viewer-body">
                    {currentMemory.media && currentMemory.media.length > 0 && (
                        <div className="memory-viewer-carousel">
                            {currentMemory.media[currentMediaIndex].type === 'image' ? (
                                <img src={currentMemory.media[currentMediaIndex].url} className="carousel-image" alt="Memory view"/>
                            ) : (
                                <video src={currentMemory.media[currentMediaIndex].url} className="carousel-video" controls/>
                            )}
                            {currentMemory.media.length > 1 && (
                                <>
                                    <button onClick={() => setCurrentMediaIndex(p => (p - 1 + currentMemory.media!.length) % currentMemory.media!.length)} className="carousel-nav-btn prev">&#10094;</button>
                                    <button onClick={() => setCurrentMediaIndex(p => (p + 1) % currentMemory.media!.length)} className="carousel-nav-btn next">&#10095;</button>
                                </>
                            )}
                        </div>
                    )}
                    <div className="memory-viewer-content">
                        <h3>{currentMemory.title}</h3>
                        <p>{currentMemory.description}</p>
                    </div>
                </div>
            )}
        </Modal>
    );
}

const MessagesScreen: React.FC<{ 
    navigateTo: (screen: Screen) => void;
    conversations: Conversation[];
    setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
    initialSelectedId?: string | null;
    onClearInitialId?: () => void;
    carpools: CarpoolTrip[];
    accommodations: AccommodationListing[];
}> = ({ navigateTo, conversations, setConversations, initialSelectedId, onClearInitialId, carpools, accommodations }) => {
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
    const [newMessage, setNewMessage] = useState('');
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const relatedPost = useMemo(() => {
        if (!selectedConversation) return null;
        const [type, id] = selectedConversation.id.split('-');
        if (type === 'carpool') {
            return carpools.find(c => c.id === id);
        } else if (type === 'accommodation') {
            return accommodations.find(a => a.id === id);
        }
        return null;
    }, [selectedConversation, carpools, accommodations]);

    useEffect(() => {
        if (initialSelectedId) {
            const conv = conversations.find(c => c.id === initialSelectedId);
            if (conv) {
                setSelectedConversation(conv);
            }
            onClearInitialId?.();
        }
    }, [initialSelectedId, conversations, onClearInitialId]);
    
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [selectedConversation?.messages]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if ((!newMessage.trim() && !selectedImage) || !selectedConversation) return;

        const newMsg: Message = {
            id: `m${Date.now()}`,
            text: newMessage.trim(),
            imageUrl: selectedImage || undefined,
            sender: 'user',
            timestamp: new Date()
        };

        const updatedConversation = {
            ...selectedConversation,
            messages: [...selectedConversation.messages, newMsg]
        };
        
        setConversations(conversations.map(c => c.id === updatedConversation.id ? updatedConversation : c));
        setSelectedConversation(updatedConversation);
        setNewMessage('');
        setSelectedImage(null);
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSelectedImage(reader.result as string);
                if (fileInputRef.current) fileInputRef.current.value = '';
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSelectedImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };
    
    if (selectedConversation) {
         return (
             <div className="main-app-screen">
                <div className="chat-view" onDragOver={handleDragOver} onDrop={handleDrop}>
                    <header className="chat-header">
                        <button onClick={() => setSelectedConversation(null)} className="chat-back-btn">&lt;</button>
                        <div className="chat-participant-avatar">{selectedConversation.participant.initials}</div>
                        <div className="chat-participant-info">
                            <h4>{selectedConversation.participant.name}</h4>
                            <span>{selectedConversation.topic}</span>
                        </div>
                    </header>
                    {relatedPost && (
                        <div className="chat-post-info-container">
                            <div className="chat-post-card">
                                <div className={`post-type-badge ${'origin' in relatedPost ? 'carpool' : 'accommodation'}`}>
                                    {'origin' in relatedPost ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 0 24 24" width="14px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM19 17H5v-4.66l.12-.34h13.77l.11.34V17z"/><circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 0 24 24" width="14px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 3L4 9v12h16V9l-8-6zm6 16h-3v-6H9v6H6v-9l6-4.5 6 4.5v9z"/></svg>
                                    )}
                                    <span>{'origin' in relatedPost ? '共乘' : '住宿'}</span>
                                </div>
                                <div className="post-card-content">
                                    <h5 className="post-card-title">
                                        {'origin' in relatedPost 
                                            ? `${relatedPost.origin} ➔ ${relatedPost.festivalName}`
                                            : `${relatedPost.festivalName} 住宿`}
                                    </h5>
                                    <div className="post-card-details">
                                        <div className="detail-item">
                                            <svg xmlns="http://www.w3.org/2000/svg" height="12px" viewBox="0 0 24 24" width="12px" fill="#6B7280"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm3.3 14.71L11 12.41V7h2v4.59l3.71 3.71-1.42 1.41z"/></svg>
                                            <span>
                                                {'departureTime' in relatedPost 
                                                    ? relatedPost.departureTime.replace('T', ' ') 
                                                    : `入住: ${relatedPost.checkInTime}`}
                                            </span>
                                        </div>
                                        <div className="detail-item">
                                            <svg xmlns="http://www.w3.org/2000/svg" height="12px" viewBox="0 0 24 24" width="12px" fill="#6B7280"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                                            <span>
                                                {'origin' in relatedPost 
                                                    ? relatedPost.festivalName 
                                                    : relatedPost.address}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {'pricePerNight' in relatedPost && (
                                    <div className="post-card-price">
                                        <span className="price-amount">${relatedPost.pricePerNight}</span>
                                        <span className="price-unit">/晚</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    <div className="chat-messages">
                        {selectedConversation.messages.map(msg => {
                            const isUser = msg.sender === 'user';
                            const senderName = isUser ? (localStorage.getItem('userName') || 'User') : selectedConversation.participant.name;
                            const senderInitials = isUser ? (localStorage.getItem('userName')?.charAt(0) || 'U') : selectedConversation.participant.initials;
                            const senderAvatar = isUser ? localStorage.getItem('userAvatar') : null;

                            return (
                                <div key={msg.id} className={`message-item ${msg.sender}`}>
                                    {!isUser && (
                                        <div className="message-avatar">
                                            {senderAvatar ? <img src={senderAvatar} alt={senderName} /> : senderInitials}
                                        </div>
                                    )}
                                    <div className="message-content-wrapper">
                                        <div className="message-info">
                                            <span className="message-sender-name">{senderName}</span>
                                            <span className="message-time">
                                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="message-bubble">
                                            {msg.imageUrl && (
                                                <div className="message-image">
                                                    <img src={msg.imageUrl} alt="Uploaded" referrerPolicy="no-referrer" />
                                                </div>
                                            )}
                                            {msg.text && <div>{msg.text}</div>}
                                        </div>
                                    </div>
                                    {isUser && (
                                        <div className="message-avatar">
                                            {senderAvatar ? <img src={senderAvatar} alt={senderName} /> : senderInitials}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                    {selectedImage && (
                        <div className="chat-image-preview">
                            <img src={selectedImage} alt="Preview" referrerPolicy="no-referrer" />
                            <button className="remove-image-btn" onClick={() => setSelectedImage(null)}>×</button>
                        </div>
                    )}
                    <form className="chat-input-form" onSubmit={handleSendMessage}>
                        <input
                            type="file"
                            accept="image/*"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleImageSelect}
                        />
                        <button 
                            type="button" 
                            className="image-upload-btn"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <ImageIcon size={24} />
                        </button>
                        <input
                            type="text"
                            placeholder="輸入訊息..."
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                        />
                        <button type="submit" className="chat-send-btn">
                            <Send size={20} />
                        </button>
                    </form>
                </div>
             </div>
         );
    }
    
    return (
        <div className="main-app-screen">
            <div className="main-content">
                <div className="messages-screen">
                     <header className="messages-header">
                        <h2>訊息中心</h2>
                    </header>
                    <div className="conversation-list">
                        {conversations.map(conv => (
                            <div key={conv.id} className="conversation-item" onClick={() => setSelectedConversation(conv)}>
                                <div className="conversation-avatar">{conv.participant.initials}</div>
                                <div className="conversation-details">
                                    <div className="conversation-header">
                                        <h4>{conv.participant.name}</h4>
                                        <span className="conversation-timestamp">
                                            {conv.messages[conv.messages.length - 1].timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="conversation-preview">
                                        {conv.messages[conv.messages.length - 1].text}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <BottomNav activeScreen="messages" navigateTo={navigateTo} />
        </div>
    );
};

const BottomNav: React.FC<{ activeScreen: Screen; navigateTo: (screen: Screen) => void }> = ({ activeScreen, navigateTo }) => (
    <nav className="bottom-nav">
        <button className={`nav-item ${activeScreen === 'home' ? 'active' : ''}`} onClick={() => navigateTo('home')}>
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z"/></svg>
        </button>
        <button className={`nav-item ${activeScreen === 'messages' ? 'active' : ''}`} onClick={() => navigateTo('messages')}>
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6zm-2 0l-8 5-8-5h16zm0 12H4V8l8 5 8-5v10z"/></svg>
        </button>
        <button className={`nav-item ${activeScreen === 'profile' ? 'active' : ''}`} onClick={() => navigateTo('profile')}>
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        </button>
    </nav>
);

const container = document.getElementById('root');
if (container) {
    // Check if we already have a root on this container
    const rootKey = '_reactRootContainer';
    if (!(container as any)[rootKey]) {
        const root = createRoot(container);
        (container as any)[rootKey] = root;
        root.render(<App />);
    } else {
        (container as any)[rootKey].render(<App />);
    }
}
