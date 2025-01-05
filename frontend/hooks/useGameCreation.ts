import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { createGame } from "@/lib/api";
import Cookies from "js-cookie";

export function useGameCreation() {
  const { isConnected, address } = useAccount();
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const startNewGame = async (asGuest: boolean = false) => {
    if (!asGuest && !isConnected) {
      toast({
        variant: "destructive",
        title: "Oh No! No wallet found ☹️",
        description: "Please connect your wallet or play as guest",
      });
      return;
    }

    try {
      setIsLoading(true);

      let playerIdentifier;

      if (asGuest) {
        // Get existing guest ID from cookie or generate new one
        playerIdentifier = Cookies.get("guestId") || `guest_${Date.now()}`;
      } else {
        playerIdentifier = address!.toString();
      }

      const newGame = await createGame(playerIdentifier);
      router.push(`/game/${newGame.gameId}`);
    } catch (error: any) {
      console.error("Failed to create game:", error);
      toast({
        variant: "destructive",
        title: "Failed to start game",
        description: "Please try again in a few seconds.",
      });
    } finally {
      setIsLoading(false);
    }
  };
  const continueToNextLevel = () => {
    setIsLoading(false);
  };

  return {
    startNewGame,
    startGuestGame: () => startNewGame(true),
    startWeb3Game: () => startNewGame(false),
    continueToNextLevel,
    isLoading,
  };
}
