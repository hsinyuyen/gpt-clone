import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { ZhuyinProvider } from '@/contexts/ZhuyinContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { MemoryProvider } from '@/contexts/MemoryContext'
import { CoinProvider } from '@/contexts/CoinContext'
import { ConversationProvider } from '@/contexts/ConversationContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { CardProvider } from '@/contexts/CardContext'
import CoinRewardListener from '@/components/CoinRewardListener'
import { ActivityProvider } from '@/contexts/ActivityContext'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <MemoryProvider>
        <CoinProvider>
          <CardProvider>
            <ConversationProvider>
              <ThemeProvider>
                <CoinRewardListener>
                  <ActivityProvider>
                    <ZhuyinProvider>
                      <Component {...pageProps} />
                    </ZhuyinProvider>
                  </ActivityProvider>
                </CoinRewardListener>
              </ThemeProvider>
            </ConversationProvider>
          </CardProvider>
        </CoinProvider>
      </MemoryProvider>
    </AuthProvider>
  )
}
