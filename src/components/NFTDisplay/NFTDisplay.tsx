'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ethers } from 'ethers';
import { fetchUserNFTs, calculateNFTPoints, PRIMOS_NFT_CONTRACT } from '@/services/nftService';
import { supabase } from '@/utils/supabase';
import HowRewardsWorks from './HowRewardsWorks';

interface NFTDisplayProps {
  provider: ethers.providers.Web3Provider | null;
  userAddress: string | null;
  refreshTrigger?: number; // New prop to trigger updates
  onLoadingStateChange?: (isLoading: boolean) => void; // Add new prop for callback
}

const NFTDisplay: React.FC<NFTDisplayProps> = ({ provider, userAddress, refreshTrigger, onLoadingStateChange }) => {
  const [nfts, setNfts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncingNFTs, setSyncingNFTs] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [eligiblePoints, setEligiblePoints] = useState<number>(0);
  const [totalBonusPoints, setTotalBonusPoints] = useState<number>(0);
  const [pointsUsedToday, setPointsUsedToday] = useState<boolean>(false);
  const [streak, setStreak] = useState<number>(0);
  const [multiplier, setMultiplier] = useState<number>(1);
  const [totalPoints, setTotalPoints] = useState<number>(0);
  const [streakBroken, setStreakBroken] = useState<boolean>(false);
  
  // Simple carousel state
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const autoRotateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [itemsPerView, setItemsPerView] = useState<number>(4);
  
  // Lazy loading state
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const imageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  
  useEffect(() => {
    if (!provider || !userAddress) return;
    
    console.log("NFTDisplay useEffect triggered, refreshTrigger:", refreshTrigger);
    
    const loadData = async () => {
      setLoading(true);
      // Notify parent component that loading started
      if (onLoadingStateChange) onLoadingStateChange(true);
      setError(null);
      
      try {
        // Load NFTs (this includes synchronization with the blockchain)
        setSyncingNFTs(true);
        const result = await fetchUserNFTs(provider, userAddress);
        const { success, nfts: userNfts } = result;
        const nftsError = 'error' in result ? result.error : null;
        setSyncingNFTs(false);
        
        if (!success) {
          if (nftsError && typeof nftsError === 'object' && 'message' in nftsError) {
            throw new Error(String(nftsError.message));
          } else {
            throw new Error('Failed to fetch NFTs');
          }
        }
        
        // Get NFTs already used today by ANY wallet
        const today = new Date().toISOString().split('T')[0];
        console.log("Checking nft_usage_tracking for date:", today);
        const { data: usedNfts, error: usedError } = await supabase
          .from('nft_usage_tracking')
          .select('token_id, contract_address')
          .eq('usage_date', today);
        // Note: We no longer filter by wallet_address
        
        console.log("Used NFTs found:", usedNfts?.length || 0);
        
        if (usedError) throw usedError;
        
        // Create a set of used NFTs
        const usedNftSet = new Set();
        usedNfts?.forEach(nft => {
          const key = `${nft.token_id}-${nft.contract_address}`;
          usedNftSet.add(key);
          console.log("Adding used NFT to set:", key);
        });
        
        // Mark NFTs as used
        const nftsWithUsageStatus = userNfts ? userNfts.map(nft => {
          const key = `${nft.tokenId}-${PRIMOS_NFT_CONTRACT.toLowerCase()}`;
          const isUsedToday = usedNftSet.has(key);
          console.log(`NFT ID:${nft.tokenId}, Key:${key}, IsUsed:${isUsedToday}`);
          return { ...nft, isUsedToday };
        }) : [];
        
        setNfts(nftsWithUsageStatus);
        
        // Check if there's a check-in query parameter in the URL, which indicates a recent check-in
        const urlParams = new URLSearchParams(window.location.search);
        const recentCheckIn = urlParams.get('check_in') === 'true';
        const streakBrokenParam = urlParams.get('streak_broken') === 'true';
        
        if (recentCheckIn && streakBrokenParam) {
          setStreakBroken(true);
        }
        
        // Load user information using the API instead of direct Supabase access
        console.log('Fetching user data from API...');
        const userDataResponse = await fetch(`/api/user-data?wallet_address=${userAddress.toLowerCase()}`);
        const userDataResult = await userDataResponse.json();
        
        if (userDataResult.error) {
          throw new Error(userDataResult.error);
        }
        
        const userData = userDataResult.data;
        
        // Also check if the user data indicates a streak break
        // but only show the message if the current streak is still 0
        if (userData) {
          if (userData.streak_broken && userData.current_streak === 0) {
            console.log("Streak broken detected from API data");
            setStreakBroken(true);
          } else if (userData.current_streak > 0) {
            // Clear the streak broken message if user has a streak > 0
            setStreakBroken(false);
          }
        }
        
        if (userData) {
          setStreak(userData.current_streak || 0);
          setTotalPoints(userData.total_points || 0);
          
          // Calculate multiplier
          let mult = 1.0;
          if (userData.current_streak >= 29) mult = 3.0;
          else if (userData.current_streak >= 22) mult = 2.5;
          else if (userData.current_streak >= 15) mult = 2.0;
          else if (userData.current_streak >= 8) mult = 1.5;
          
          setMultiplier(mult);
        } else {
          console.log('No user data found');
          setStreak(0);
          setTotalPoints(0);
          setMultiplier(1.0);
        }
        
        // Calculate NFT points - both eligible (unused) and total
        const { totalPoints: eligibleNftPoints, eligibleNfts } = await calculateNFTPoints(userAddress);
        setEligiblePoints(eligibleNftPoints);
        
        // Now calculate total points from all NFTs regardless of usage
        const { data: allNfts, error: allNftsError } = await supabase
          .from('nfts')
          .select('bonus_points')
          .eq('wallet_address', userAddress.toLowerCase());
          
        if (allNftsError) throw allNftsError;
        
        const allNftsTotal = allNfts.reduce((sum, nft) => sum + (nft.bonus_points || 0), 0);
        setTotalBonusPoints(allNftsTotal);
        
        // Determine if all points are used today
        setPointsUsedToday(allNftsTotal > 0 && eligibleNftPoints === 0);
        
      } catch (err: any) {
        console.error('Error loading NFT data:', err);
        if (err instanceof Error) {
          setError(err.message || 'An error occurred while loading NFT data');
        } else {
          // Handle cases where err might be an empty object or something else
          console.error('Unexpected error format:', JSON.stringify(err));
          setError('An unknown error occurred while loading NFT data. Check console for details.');
        }
      } finally {
        setLoading(false);
        // Notify parent component that loading finished
        if (onLoadingStateChange) onLoadingStateChange(false);
      }
    };
    
    loadData();
  }, [provider, userAddress, refreshTrigger, onLoadingStateChange]);
  
  // Handle responsive sizing for carousel - maximum 4 on desktop as requested
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= 1024) { // lg and above (desktop)
        setItemsPerView(4);
      } else if (width >= 768) { // md
        setItemsPerView(3);
      } else if (width >= 640) { // sm
        setItemsPerView(2);
      } else {
        setItemsPerView(1);
      }
    };
    
    handleResize(); // Initial setup
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Auto-rotation for carousel is disabled as requested
  useEffect(() => {
    // Cleanup function in case there was an existing timer
    return () => {
      if (autoRotateTimerRef.current) {
        clearInterval(autoRotateTimerRef.current);
        autoRotateTimerRef.current = null;
      }
    };
  }, []);
  
  // Setup lazy loading with Intersection Observer
  const setupImageObserver = useCallback(() => {
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      // Cleanup previous observer if it exists
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      
      // Create new observer
      observerRef.current = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          // If element is visible
          if (entry.isIntersecting) {
            const nftIndex = Number(entry.target.getAttribute('data-nft-index'));
            if (!isNaN(nftIndex)) {
              // Mark this image to be loaded
              setLoadedImages(prev => {
                const newSet = new Set(prev);
                newSet.add(nftIndex);
                return newSet;
              });
              
              // Unobserve this element since we no longer need to track it
              observerRef.current?.unobserve(entry.target);
            }
          }
        });
      }, {
        root: null, // viewport
        rootMargin: '200px', // Load images that are 200px away from viewport
        threshold: 0.1 // Trigger when at least 10% of the element is visible
      });
      
      // Start observing all image containers
      imageRefs.current.forEach((ref) => {
        if (ref) {
          observerRef.current?.observe(ref);
        }
      });
    }
  }, []);
  
  // Effect to setup observer when nfts change
  useEffect(() => {
    // Reset loaded images when nfts change but preload first itemsPerView images
    const initialLoadedImages = new Set<number>();
    
    // Preload the first itemsPerView images (the ones visible initially)
    for (let i = 0; i < Math.min(itemsPerView, nfts.length); i++) {
      initialLoadedImages.add(i);
    }
    
    setLoadedImages(initialLoadedImages);
    
    // Clear existing image refs
    imageRefs.current = new Map();
    
    // Setup observer after a small delay to ensure refs are populated
    const timer = setTimeout(() => {
      setupImageObserver();
    }, 100);
    
    return () => {
      clearTimeout(timer);
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [nfts, setupImageObserver, itemsPerView]);
  
  // Navigation handlers with observer reset
  const goToPrevSlide = () => {
    setCurrentSlide(prev => {
      const newSlide = prev === 0 ? Math.max(0, nfts.length - itemsPerView) : Math.max(0, prev - 1);
      // Setup observer again after slide change to track new visible elements
      setTimeout(setupImageObserver, 100);
      return newSlide;
    });
  };
  
  const goToNextSlide = () => {
    setCurrentSlide(prev => {
      const maxSlide = Math.max(0, nfts.length - itemsPerView);
      const newSlide = prev >= maxSlide ? 0 : prev + 1;
      // Setup observer again after slide change to track new visible elements
      setTimeout(setupImageObserver, 100);
      return newSlide;
    });
  };
  
  // Method to set image container ref
  const setImageRef = useCallback((el: HTMLDivElement | null, index: number) => {
    if (el) {
      imageRefs.current.set(index, el);
    } else {
      imageRefs.current.delete(index);
    }
  }, []);
  
  // Get visible NFTs
  const getVisibleNFTs = () => {
    return nfts.slice(currentSlide, currentSlide + itemsPerView);
  };
  
  // Calculate potential daily points using totalBonusPoints instead of eligiblePoints
  const dailyPointsPotential = totalBonusPoints * multiplier;
  
  // Function to determine the style for each rarity type
  const getRarityStyle = (rarity: string) => {
    switch(rarity.toLowerCase()) {
      case 'original':
        return 'bg-[#C50045]';
      case 'original z':
        return 'bg-[#EA0354]';
      case 'shiny':
        return 'bg-gradient-to-r from-[#00E9FF] via-[#AD4DFF] to-[#FF7CFF]';
      case 'shiny z':
        return 'bg-gradient-to-r from-[#00E9FF] via-[#AD4DFF] via-[#FF7CFF] to-[#FF6265]';
      case 'unique':
        return 'bg-gradient-to-r from-[#FFC800] to-[#FF4B4B]';
      default:
        return 'bg-gray-500';
    }
  };
  
  if (!provider || !userAddress) {
    return <div className="p-6 bg-gray-100 rounded-lg">Connect your wallet to view NFTs</div>;
  }
  
  return (
    <div className="bg-gray-800 rounded-lg shadow-md p-6 mt-8 text-white">
      
      <h2 className="text-2xl font-bold mb-4 uppercase">Bonus rewards</h2> 
      
      {streakBroken && (
        <div className="bg-red-100 text-red-700 p-4 rounded-md mb-4 border-l-4 border-red-500">
          <p className="font-bold">Streak Lost!</p>
          <p>You have lost your daily check-in streak. Your streak has been reset to 0.</p>
          <p className="text-sm mt-1">Remember to check in every day to maintain your streak and earn better multipliers.</p>
        </div>
      )}
      
      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-md mb-4">
          {error}
        </div>
      )}
      
      <div className="flex flex-col gap-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-700 p-4 rounded-md">
            <div className="flex items-center">
              <img 
                src="/images/bonus_primos.png" 
                alt="Primos Bonus" 
                className="h-12 w-12 mr-3" 
              />
              <div className="flex-1">
                <h3 className="font-bold text-lg text-white">Total Primos Bonus</h3>
                <p className="text-2xl font-bold text-white">+{totalBonusPoints}</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-700 p-4 rounded-md">
            <div className="flex items-center">
              <img 
                src="/images/bous_multiplier.png" 
                alt="Multiplier Bonus" 
                className="h-12 w-12 mr-3" 
              />
              <div>
                <h3 className="font-bold text-lg text-white">Streak Multiplier Bonus</h3>
                <p className="text-2xl font-bold text-white">x{multiplier}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
<h3 className="text-xl font-bold mt-6 mb-4 uppercase">Your Primos</h3>
      
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : nfts.length === 0 ? (
        <div 
          className="text-center py-12 rounded-md flex items-center justify-center mb-8" 
          style={{
            backgroundImage: 'url(/images/primo_estatua.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            minHeight: '200px',
            filter: 'grayscale(100%)'
          }}
        >
          <p className="font-bold text-white text-lg bg-black bg-opacity-50 px-4 py-2 rounded">No Primos found in your wallet</p>
        </div>
      ) : (
        <div 
          className="relative py-2"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Simple Carousel */}
          <div className="relative overflow-hidden">
            {/* Left control button */}
            <button 
              onClick={goToPrevSlide}
              className="absolute left-0 top-1/2 transform -translate-y-1/2 z-10 bg-gray-800 bg-opacity-70 hover:bg-opacity-90 text-white rounded-full p-2 focus:outline-none shadow-lg"
              aria-label="Previous NFTs"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            {/* Main Carousel Container */}
            <div className="overflow-hidden">
              <div 
                className="flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${currentSlide * (100 / itemsPerView)}%)` }}
              >
                {nfts.map((nft, index) => (
                  <div 
                    key={index} 
                    className="flex-none px-2"
                    style={{ width: `${100 / itemsPerView}%` }}
                  >
                    <div className="rounded-lg overflow-hidden bg-gray-700 h-full">
                      {nft.metadata?.image && (
                        <div 
                          className="h-40 flex items-center justify-center relative overflow-hidden"
                          ref={(el) => setImageRef(el, index)}
                          data-nft-index={index}
                        >
                          {loadedImages.has(index) ? (
                            <img 
                              src={nft.metadata.image} 
                              alt={nft.metadata.name || `NFT #${nft.tokenId}`}
                              className={`w-full h-full object-cover ${nft.isUsedToday ? 'opacity-50' : ''}`}
                              loading={index < itemsPerView ? "eager" : "lazy"}
                              onError={(e) => {
                                e.currentTarget.src = '/placeholder-nft.png'; // Fallback image
                              }}
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-800 animate-pulse flex items-center justify-center">
                              <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          {nft.isUsedToday && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="bg-red-500 text-white px-2 py-1 rounded text-sm font-bold">
                                Used Today
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="p-4 text-white">
                        <h4 className="font-bold">{nft.metadata?.name || `NFT #${nft.tokenId}`}</h4>
                        <p className="text-sm text-gray-300">Bonus: +{nft.bonusPoints}</p>
                        {nft.isUsedToday ? (
                          <p className="text-xs text-red-400 mt-1">Available at 00:00 UTC</p>
                        ) : (
                          <p className="text-xs text-green-400 mt-1">Available now</p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {nft.rarity && (
                            <span className={`inline-block px-1 py-0.5 text-white text-xs font-bold rounded uppercase ${getRarityStyle(nft.rarity)}`}>
                              {nft.rarity}
                            </span>
                          )}
                          {nft.isFullSet && (
                            <span className="inline-block px-1 py-0.5 bg-[#36B57C] text-white text-xs font-bold rounded uppercase">
                              Full Set
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Right control button */}
            <button 
              onClick={goToNextSlide}
              className="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 bg-gray-800 bg-opacity-70 hover:bg-opacity-90 text-white rounded-full p-2 focus:outline-none shadow-lg"
              aria-label="Next NFTs"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          
          {/* Progress Indicator */}
          <div className="flex justify-center mt-4 space-x-1">
            {Array.from({ length: Math.ceil(nfts.length / itemsPerView) }).map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index * itemsPerView)}
                className={`h-2 rounded-full focus:outline-none transition-all duration-300 ${
                  Math.floor(currentSlide / itemsPerView) === index 
                    ? 'w-4 bg-blue-500' 
                    : 'w-2 bg-gray-600 hover:bg-gray-500'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
          
          {/* NFT Count */}
          <div className="mt-2 text-center text-sm text-gray-400">
            Total: {nfts.length} Primos
          </div>
        </div>
      )}
      
      <HowRewardsWorks />
    </div>
  );
};

export default NFTDisplay;
