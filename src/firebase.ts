import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  collection,
  onSnapshot,
  setDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDoc,
  getDocs,
  Timestamp
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD9g7l32oBL8iU1PCYghhlqHUGSvNNo-0g",
  authDomain: "rf2smm.firebaseapp.com",
  databaseURL: "https://rf2smm-default-rtdb.firebaseio.com",
  projectId: "rf2smm",
  storageBucket: "rf2smm.firebasestorage.app",
  messagingSenderId: "738689283525",
  appId: "1:738689283525:web:3d4463c5b1b8167e31c7ac",
  measurementId: "G-6N4GZML6EK"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Default initial services to seed if Firestore collection is empty
export const DEFAULT_SERVICES = [
  {
    category: "Facebook Followers & Likes",
    name: "FB Page Followers | Non-Drop High Quality",
    price: 120, // 120 Coins per 1k
    min: 100,
    max: 50000,
    desc: "Instant start. High quality non-drop profile/page followers with 30-day auto refill guarantee.",
    apiServiceId: "101"
  },
  {
    category: "Facebook Followers & Likes",
    name: "FB Post Likes | Fast Speed Real",
    price: 45,
    min: 50,
    max: 20000,
    desc: "Instant start. 100% active profile post likes with high retention.",
    apiServiceId: "102"
  },
  {
    category: "Instagram Followers & Likes",
    name: "IG Real Followers | Premium Active",
    price: 150,
    min: 100,
    max: 100000,
    desc: "Speed 10k-20k/day. Real looking accounts with active stories.",
    apiServiceId: "201"
  },
  {
    category: "Instagram Followers & Likes",
    name: "IG Likes | Super Fast Instant",
    price: 35,
    min: 50,
    max: 50000,
    desc: "Instant delivery. Boosts post ranking and explore algorithm.",
    apiServiceId: "202"
  },
  {
    category: "TikTok Services",
    name: "TikTok Followers | Real Accounts",
    price: 180,
    min: 100,
    max: 50000,
    desc: "High quality global TikTok followers with quick start.",
    apiServiceId: "301"
  },
  {
    category: "TikTok Services",
    name: "TikTok Video Likes | Viral Speed",
    price: 40,
    min: 100,
    max: 100000,
    desc: "Instant delivery for TikTok videos. Helps get on For You page.",
    apiServiceId: "302"
  },
  {
    category: "YouTube Services",
    name: "YouTube Subscribers | Real & Monetizable",
    price: 450,
    min: 100,
    max: 10000,
    desc: "100% safe channel subscribers. Safe for monetization.",
    apiServiceId: "401"
  },
  {
    category: "YouTube Services",
    name: "YouTube Video Views | High Retention",
    price: 90,
    min: 500,
    max: 1000000,
    desc: "Real user views with high watch time.",
    apiServiceId: "402"
  },
  {
    category: "Telegram Services",
    name: "Telegram Channel Members | Non-Drop",
    price: 85,
    min: 100,
    max: 50000,
    desc: "Public or private link supported. Fast delivery.",
    apiServiceId: "501"
  }
];

export {
  doc,
  collection,
  onSnapshot,
  setDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDoc,
  getDocs,
  Timestamp
};
