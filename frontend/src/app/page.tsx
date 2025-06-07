import Navbar from "./components/Navbar"; // adjust path if needed

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-teal-200 via-blue-400 to-indigo-700 text-white font-sans">
      <Navbar />

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 sm:px-12 py-24 gap-10">
        <h2 className="text-4xl sm:text-5xl font-extrabold leading-tight drop-shadow-2xl max-w-full whitespace-nowrap">
           Keeping in Touch on Autopilot
        </h2>
        <p className="text-lg sm:text-xl font-medium max-w-2xl text-white/90">
          <span className="text-xl sm:text-2xl font-medium">
            Use conversational voice AI to make staying close effortless <br/>
            so even 10 years later, everyone is still up to date with your life
             
          </span>
        </p>

        <div className="flex gap-4 mt-6 flex-col sm:flex-row">
          <a
            href="/join"
            className="bg-white text-indigo-700 border-2 border-white hover:bg-transparent hover:text-white hover:border-white transition-colors px-6 py-3 rounded-full font-semibold text-sm sm:text-base shadow-lg"
          >
            Dive In
          </a>
          <a
            href="/signin"
            className="border-2 border-white hover:bg-white hover:text-indigo-700 transition-colors px-6 py-3 rounded-full font-semibold text-sm sm:text-base shadow-lg"
          >
            Log In
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-sm text-white/70 bg-indigo-950">
        © {new Date().getFullYear()} Bondiver — Built to Keep You Close.
      </footer>
    </div>
  );
}
