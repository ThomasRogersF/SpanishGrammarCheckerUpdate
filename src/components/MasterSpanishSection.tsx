import { Play, Star, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';

interface Testimonial {
  name: string;
  location: string;
  quote: string;
  image: string;
  video: string;
}

const testimonials: Testimonial[] = [
  {
    name: 'Boris',
    location: 'SpanishVIP Student',
    quote: 'SpanishVIP completely transformed my Spanish! In just 3 months I went from beginner to having real conversations.',
    image: '/Images/testimonials-preview/boris-testimonial.png',
    video: '/Videos/boris-testimonial.mp4',
  },
  {
    name: 'Catie',
    location: 'SpanishVIP Student',
    quote: 'The personalized approach is incredible. My tutor adapted to my learning style and I progressed super fast.',
    image: '/Images/testimonials-preview/catie-testimonial.png',
    video: '/Videos/catie-testimonial.mp4',
  },
  {
    name: 'Chris',
    location: 'SpanishVIP Student',
    quote: 'I love how flexible the classes are. I can learn Spanish with my busy schedule and the results are amazing.',
    image: '/Images/testimonials-preview/chris-testimonial.png',
    video: '/Videos/chris-testimonial.mp4',
  },
  {
    name: 'Kholman',
    location: 'SpanishVIP Student',
    quote: 'The interactive lessons and native speakers made learning Spanish feel natural and enjoyable.',
    image: '/Images/testimonials-preview/kholman-testimonial.png',
    video: '/Videos/kholman-testimonial.mp4',
  },
  {
    name: 'Koji',
    location: 'SpanishVIP Student',
    quote: 'As a native English speaker, SpanishVIP helped me achieve fluency faster than any other method I tried.',
    image: '/Images/testimonials-preview/koji-testimonial.png',
    video: '/Videos/koji-testimonial.mp4',
  },
  {
    name: 'Suzanne',
    location: 'SpanishVIP Student',
    quote: 'The personalized feedback and cultural insights made all the difference in my Spanish learning journey.',
    image: '/Images/testimonials-preview/suzanne-testimonial.png',
    video: '/Videos/suzanne-testimonial.mp4',
  },
];

export default function MasterSpanishSection() {
  const [playingVideo, setPlayingVideo] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null);

  // Responsive detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const testimonialsPerView = isMobile ? 1 : 3;
  const totalSlides = Math.ceil(testimonials.length / testimonialsPerView);

  // Auto-play functionality
  useEffect(() => {
    if (!isDragging) {
      autoPlayRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % totalSlides);
      }, 5000);
    }
    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
    };
  }, [totalSlides, isDragging]);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const playVideo = useCallback((index: number) => {
    setPlayingVideo(index);
  }, []);

  const closeVideo = useCallback(() => {
    setPlayingVideo(null);
  }, []);

  // Enhanced drag functionality
  const handleDragStart = useCallback((clientX: number) => {
    setIsDragging(true);
    setDragStart(clientX);
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
    }
  }, []);

  const handleDragMove = useCallback((clientX: number) => {
    if (!isDragging) return;

    const walk = clientX - dragStart;
    const threshold = 50;

    if (Math.abs(walk) > threshold) {
      if (walk > 0) {
        prevSlide();
      } else {
        nextSlide();
      }
      setIsDragging(false);
    }
  }, [isDragging, dragStart, prevSlide, nextSlide]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    handleDragStart(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.clientX);
  };

  const handleMouseUp = () => {
    handleDragEnd();
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  return (
    <section className="bg-gradient-to-br from-orange-50 to-red-100 rounded-2xl p-8 my-16">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Ready to master Spanish?
        </h2>
        <p className="text-lg text-gray-700 max-w-2xl mx-auto">
          Join thousands who improved faster with SpanishVIP’s personalized 1-on-1 classes. Learn with native teachers on your schedule.
        </p>
      </div>

      {/* Carousel Container */}
      <div className="relative mb-8">
        {/* Navigation Arrows - Hidden on Mobile */}
        {!isMobile && (
          <>
            <button
              onClick={prevSlide}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-white/95 hover:bg-white rounded-full p-3 shadow-xl transition-all duration-300 hover:scale-110 border border-gray-200"
              aria-label="Previous testimonials"
            >
              <ChevronLeft className="h-5 w-5 text-gray-700" />
            </button>

            <button
              onClick={nextSlide}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-white/95 hover:bg-white rounded-full p-3 shadow-xl transition-all duration-300 hover:scale-110 border border-gray-200"
              aria-label="Next testimonials"
            >
              <ChevronRight className="h-5 w-5 text-gray-700" />
            </button>
          </>
        )}

        {/* Carousel Content */}
        <div className={`overflow-hidden ${isMobile ? 'px-2' : 'px-16'}`}>
          <div
            ref={carouselRef}
            className={`flex transition-transform duration-500 ease-out ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleDragEnd}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {Array.from({ length: totalSlides }).map((_, slideIndex) => (
              <div
                key={slideIndex}
                className="flex-shrink-0 w-full px-4"
              >
                <div className={`grid ${isMobile ? 'grid-cols-1 gap-8 px-2' : 'grid-cols-3 gap-6'}`}>
                  {testimonials
                    .slice(slideIndex * testimonialsPerView, (slideIndex + 1) * testimonialsPerView)
                    .map((testimonial, index) => (
                      <div
                        key={slideIndex * testimonialsPerView + index}
                        className={`group bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100 ${isMobile ? 'p-6 w-full max-w-4xl mx-auto' : 'p-6'}`}
                      >
                        {/* Testimonial Image */}
                        <div className="relative mb-4 overflow-hidden rounded-lg">
                          <div className="aspect-[4/5] bg-gray-100">
                            <img
                              src={testimonial.image}
                              alt={`${testimonial.name} testimonial`}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            {/* Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            {/* Play Button */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <button
                                onClick={() => playVideo(slideIndex * testimonialsPerView + index)}
                                className="bg-white/90 hover:bg-white rounded-full p-4 shadow-lg transition-all duration-200 hover:scale-110"
                                aria-label={`Play ${testimonial.name}'s testimonial video`}
                              >
                                <Play className="h-6 w-6 text-gray-800 ml-1" fill="currentColor" />
                              </button>
                            </div>
                            {/* Name Badge */}
                            <div className="absolute bottom-3 left-3 bg-black/80 text-white text-xs px-3 py-1 rounded-full font-medium">
                              {testimonial.name}
                            </div>
                          </div>
                        </div>

                        {/* Rating */}
                        <div className="flex items-center mb-3">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className="h-4 w-4 text-yellow-400 fill-current"
                            />
                          ))}
                          <span className="ml-2 text-sm text-gray-600 font-medium">5.0</span>
                        </div>

                        {/* Quote */}
                        <blockquote className="text-gray-700 text-sm leading-relaxed mb-4 italic">
                          "{testimonial.quote}"
                        </blockquote>

                        {/* Attribution */}
                        <div className="flex items-center text-xs text-gray-500">
                          <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center mr-2">
                            <span className="text-orange-600 font-semibold text-xs">
                              {testimonial.name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <div className="font-semibold text-gray-800">{testimonial.name}</div>
                            <div>{testimonial.location}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dots Indicator */}
        <div className="flex justify-center gap-3 mt-6">
          {Array.from({ length: totalSlides }).map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'bg-orange-500 scale-125'
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Video Overlay */}
      {playingVideo !== null && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={closeVideo}
        >
          <div
            className="relative max-w-5xl w-full max-h-[85vh] bg-black rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={closeVideo}
              className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all duration-200 hover:scale-110"
              aria-label="Close video"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Video Info */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
              <h3 className="text-white text-xl font-semibold mb-2">
                {testimonials[playingVideo].name}
              </h3>
              <p className="text-gray-300 text-sm">
                {testimonials[playingVideo].location}
              </p>
            </div>

            {/* Video Player */}
            <video
              src={testimonials[playingVideo].video}
              controls
              autoPlay
              className="w-full h-full object-contain"
              poster={testimonials[playingVideo].image}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      )}

      <div className="text-center">
        <button
          onClick={() => window.parent.postMessage({ action: 'redirect', url: 'https://spanishvip.com/free-class/' }, '*')}
          className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white px-8 py-3 text-lg font-semibold rounded-lg transition"
          aria-label="Start learning today"
        >
          Start learning today
        </button>
        <p className="text-sm text-gray-600 mt-2">
          Free trial • No credit card • Cancel anytime
        </p>
      </div>
    </section>
  );
}