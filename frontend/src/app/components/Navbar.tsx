"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
      isScrolled 
        ? 'bg-white/10 backdrop-blur-xl shadow-2xl border-b border-white/20' 
        : 'bg-transparent'
    }`}>
      <div className="max-w-[90vw] mx-auto px-[3vw] sm:px-[4vw]">
        <div className="flex items-center justify-between h-[4rem] sm:h-[5rem]">
          {/* Brand */}
          <Link
            href="/"
            className="group"
          >
            <span className="flex items-center gap-[0.75rem] text-[1.5rem] sm:text-[1.875rem] font-bold bg-gradient-to-r from-purple-300 to-purple-100 bg-clip-text text-transparent group-hover:from-purple-200 group-hover:to-white transition-all duration-300 drop-shadow-[0_0_20px_rgba(168,85,247,0.5)] group-hover:drop-shadow-[0_0_25px_rgba(168,85,247,0.7)]">
              <img src="/bondiverLogoImg.png" alt="Bondiver Logo" className="h-[1.5rem] w-auto sm:h-[1.875rem]" />
              Bondiver
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-[2rem]">
            <Link
              href="/signin"
              className="text-white/80 hover:text-white transition-colors duration-300 font-medium relative group"
            >
              Sign In
              <span className="absolute -bottom-[0.25rem] left-0 w-0 h-[0.125rem] bg-gradient-to-r from-cyan-400 to-blue-600 group-hover:w-full transition-all duration-300"></span>
            </Link>
            <Link
              href="/join"
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-[1.5rem] py-[0.625rem] rounded-full font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-cyan-500/25 transform hover:-translate-y-0.5"
            >
              Get Started
            </Link>
          </nav>

          {/* Mobile Menu Button */}
          <button className="md:hidden text-white hover:text-cyan-400 transition-colors duration-300">
            <svg className="w-[1.5rem] h-[1.5rem]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
