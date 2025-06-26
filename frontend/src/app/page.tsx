import Navbar from "./components/Navbar";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white font-sans overflow-x-hidden">
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-[3vw] sm:px-[4vw] pt-[5rem]">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-[10vw] -right-[10vw] w-[20vw] h-[20vw] bg-cyan-500/20 rounded-full blur-[3vw] animate-pulse"></div>
          <div className="absolute -bottom-[10vw] -left-[10vw] w-[20vw] h-[20vw] bg-blue-500/20 rounded-full blur-[3vw] animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[24vw] h-[24vw] bg-indigo-500/10 rounded-full blur-[3vw] animate-pulse delay-500"></div>
        </div>

        <div className="relative z-10 text-center max-w-[90vw] mx-auto">
          <div className="mb-[2rem]">
            <h1 className="text-[3rem] sm:text-[4.5rem] font-bold leading-tight mb-[1.5rem] bg-gradient-to-r from-white via-cyan-100 to-blue-200 bg-clip-text text-transparent animate-fade-in">
              Stay Connected With
              <span className="block text-[3.5rem] sm:text-[5rem] bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-500 bg-clip-text text-transparent">Authentic Voice Updates</span>
            </h1>
          </div>
          
          <p className="text-[1.25rem] sm:text-[1.5rem] font-medium max-w-[80vw] mx-auto text-white/90 mb-[3rem] leading-relaxed">
             Powered by Conversational AI
          </p>

          <div className="flex justify-center">
            <a
              href="/signin"
              className="group bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-[2.5rem] py-[1.25rem] rounded-full font-semibold text-[1.25rem] shadow-2xl hover:shadow-cyan-500/25 transition-all duration-300 transform hover:-translate-y-1 hover:scale-105"
            >
              <span className="flex items-center justify-center gap-[0.75rem]">
                Dive In
                <svg className="w-[1.5rem] h-[1.5rem] group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            </a>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-[2rem] left-1/2 transform -translate-x-1/2 animate-bounce">
          <div className="w-[1.5rem] h-[2.5rem] border-2 border-white/30 rounded-full flex justify-center">
            <div className="w-[0.25rem] h-[0.75rem] bg-white/60 rounded-full mt-[0.5rem] animate-pulse"></div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-[6rem] px-[3vw] sm:px-[4vw] bg-gradient-to-b from-transparent to-black/20">
        <div className="max-w-[90vw] mx-auto">
          <h2 className="text-[2.5rem] sm:text-[3rem] font-bold text-center mb-[4rem] bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Why Choose Bondiver?
          </h2>
          
          <div className="grid md:grid-cols-3 gap-[2rem]">
            {/* Feature 1 */}
            <div className="group bg-white/5 backdrop-blur-sm rounded-[1rem] p-[2rem] border border-white/10 hover:border-cyan-500/30 transition-all duration-300 hover:transform hover:-translate-y-2">
              <div className="w-[4rem] h-[4rem] bg-gradient-to-br from-cyan-500 to-blue-600 rounded-[0.75rem] flex items-center justify-center mb-[1.5rem] group-hover:scale-110 transition-transform duration-300">
                <svg className="w-[2rem] h-[2rem] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-[1.5rem] font-bold mb-[1rem] text-white">Voice Conversations</h3>
              <p className="text-white/80 leading-relaxed">
                Natural voice interactions that feel like talking to a close friend. No more typing, just speak naturally.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group bg-white/5 backdrop-blur-sm rounded-[1rem] p-[2rem] border border-white/10 hover:border-cyan-500/30 transition-all duration-300 hover:transform hover:-translate-y-2">
              <div className="w-[4rem] h-[4rem] bg-gradient-to-br from-cyan-500 to-blue-600 rounded-[0.75rem] flex items-center justify-center mb-[1.5rem] group-hover:scale-110 transition-transform duration-300">
                <svg className="w-[2rem] h-[2rem] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-[1.5rem] font-bold mb-[1rem] text-white">Automatic Updates</h3>
              <p className="text-white/80 leading-relaxed">
                AI automatically keeps your loved ones updated with your latest news, achievements, and life events.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group bg-white/5 backdrop-blur-sm rounded-[1rem] p-[2rem] border border-white/10 hover:border-cyan-500/30 transition-all duration-300 hover:transform hover:-translate-y-2">
              <div className="w-[4rem] h-[4rem] bg-gradient-to-br from-cyan-500 to-blue-600 rounded-[0.75rem] flex items-center justify-center mb-[1.5rem] group-hover:scale-110 transition-transform duration-300">
                <svg className="w-[2rem] h-[2rem] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h3 className="text-[1.5rem] font-bold mb-[1rem] text-white">Stay Connected</h3>
              <p className="text-white/80 leading-relaxed">
                Maintain relationships even when life gets busy. Never lose touch with the people who matter most.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-[6rem] px-[3vw] sm:px-[4vw]">
        <div className="max-w-[80vw] mx-auto text-center">
          <h2 className="text-[2.5rem] sm:text-[3rem] font-bold mb-[2rem] bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Ready to Transform Your Relationships?
          </h2>
          <a
            href="/join"
            className="inline-flex items-center gap-[0.75rem] bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-[2.5rem] py-[1rem] rounded-full font-semibold text-[1.25rem] shadow-2xl hover:shadow-cyan-500/25 transition-all duration-300 transform hover:-translate-y-1 hover:scale-105"
          >
            Start Your Journey
            <svg className="w-[1.5rem] h-[1.5rem]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-[3rem] px-[3vw] sm:px-[4vw] border-t border-white/10">
        <div className="max-w-[90vw] mx-auto text-center">
          <p className="text-white/60 text-[0.875rem]">
            © 2025 Bondiver. Keeping relationships alive through intelligent conversation.
          </p>
        </div>
      </footer>
    </div>
  );
}
