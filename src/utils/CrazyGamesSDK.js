/**
 * CrazyGames SDK v2 / v3 integration wrapper.
 * Safely handles SDK presence, gameplay lifecycle hooks, happytime milestones,
 * and ad callbacks with safe fallbacks when running outside the platform.
 */
export class CrazyGamesSDK {
  static instance = null;

  static getInstance() {
    if (!this.instance) {
      this.instance = new CrazyGamesSDK();
    }
    return this.instance;
  }

  constructor() {
    this.sdk = null;
    this.initialized = false;
    this.isOnCrazyGames = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      if (typeof window !== 'undefined' && window.CrazyGames && window.CrazyGames.SDK) {
        this.sdk = window.CrazyGames.SDK;
        if (typeof this.sdk.init === 'function') {
          await this.sdk.init();
        }
        this.isOnCrazyGames = true;
        console.log('[CrazyGames] SDK initialized successfully');
      } else {
        // Fallback / standalone development
        this.isOnCrazyGames = false;
      }
    } catch (err) {
      console.warn('[CrazyGames] SDK initialization warning (running in standalone mode):', err);
      this.isOnCrazyGames = false;
    } finally {
      this.initialized = true;
    }
  }

  /**
   * Must be called when the player actively starts or resumes gameplay.
   */
  gameplayStart() {
    try {
      if (this.sdk && this.sdk.game && typeof this.sdk.game.gameplayStart === 'function') {
        this.sdk.game.gameplayStart();
      }
    } catch (err) {
      console.warn('[CrazyGames] gameplayStart error:', err);
    }
  }

  /**
   * Must be called when gameplay stops (pause, game over, returning to main menu).
   */
  gameplayStop() {
    try {
      if (this.sdk && this.sdk.game && typeof this.sdk.game.gameplayStop === 'function') {
        this.sdk.game.gameplayStop();
      }
    } catch (err) {
      console.warn('[CrazyGames] gameplayStop error:', err);
    }
  }

  /**
   * Celebrate happy milestones: level up, overtaking rival, new high score!
   */
  happytime() {
    try {
      if (this.sdk && this.sdk.game && typeof this.sdk.game.happytime === 'function') {
        this.sdk.game.happytime();
      }
    } catch (err) {
      console.warn('[CrazyGames] happytime error:', err);
    }
  }

  /**
   * Fetch current CrazyGames user info if logged in
   */
  async getUser() {
    try {
      if (this.sdk && this.sdk.user && typeof this.sdk.user.getUser === 'function') {
        return await this.sdk.user.getUser();
      }
    } catch {}
    return null;
  }

  /**
   * Optional midgame interstitial ad (between runs)
   */
  async requestMidgameAd({ beforeAd, afterAd, error } = {}) {
    if (!this.sdk || !this.sdk.ad || typeof this.sdk.ad.requestAd !== 'function') {
      if (afterAd) afterAd();
      return;
    }

    try {
      this.sdk.ad.requestAd('midgame', {
        adStarted: () => { if (beforeAd) beforeAd(); },
        adFinished: () => { if (afterAd) afterAd(); },
        adError: (e) => {
          console.warn('[CrazyGames] Ad error:', e);
          if (error) error(e);
          if (afterAd) afterAd();
        },
      });
    } catch (err) {
      if (afterAd) afterAd();
    }
  }

  /**
   * Optional rewarded ad (e.g. for extra life or nitro reload)
   */
  async requestRewardedAd({ beforeAd, afterAd, reward, error } = {}) {
    if (!this.sdk || !this.sdk.ad || typeof this.sdk.ad.requestAd !== 'function') {
      if (reward) reward();
      if (afterAd) afterAd();
      return;
    }

    try {
      this.sdk.ad.requestAd('rewarded', {
        adStarted: () => { if (beforeAd) beforeAd(); },
        adFinished: () => {
          if (reward) reward();
          if (afterAd) afterAd();
        },
        adError: (e) => {
          console.warn('[CrazyGames] Rewarded ad error:', e);
          if (error) error(e);
          if (afterAd) afterAd();
        },
      });
    } catch (err) {
      if (afterAd) afterAd();
    }
  }
}
