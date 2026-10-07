import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";

import { Button, Placeholder, Skeleton } from "../../components/kit";
import { ProfileView } from "../../components/profile/ProfileView";
import { MWA_AVAILABLE } from "../../lib/mwa";
import { PRIVY_ENABLED } from "../../lib/privy";
import { useWallet } from "../../lib/wallet";

/**
 * Your profile: Instagram's layout, Juno's data. See `ProfileView`.
 *
 * The wallet card, the portfolio total and the watchlist and plans moved,
 * they did not go away: the wallet card and Disconnect live behind the
 * settings button, the portfolio total and the watchlist and plans under the
 * Holdings tab.
 */
export default function ProfileScreen() {
  const wallet = useWallet();

  if (!wallet.ready) {
    return (
      <Page edges={["top"]}>
        <Padded>
          <Skeleton h={92} w={92} round={46} />
          <Skeleton h={14} w="50%" style={{ marginTop: 16 }} />
          <Skeleton h={36} w="100%" style={{ marginTop: 16 }} />
        </Padded>
      </Page>
    );
  }

  if (!wallet.address) {
    return (
      <Page edges={["top"]}>
        <Placeholder
          title="No wallet yet"
          detail={
            MWA_AVAILABLE
              ? "Connect Seed Vault or any Solana wallet app with Mobile Wallet Adapter, or sign in with email."
              : PRIVY_ENABLED
                ? "Sign in with your email, or use a devnet dev wallet. Mobile Wallet Adapter is Android-only."
                : "Create one to trade and to launch your own coins. No sign-up."
          }
          action={<Button label="Connect wallet" onPress={() => void wallet.connect().catch(() => undefined)} />}
        />
      </Page>
    );
  }

  return <ProfileView wallet={wallet.address} self />;
}

const Page = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(p) => p.theme.colors.bg};
`;

const Padded = styled.View`
  padding: ${(p) => p.theme.space(4)}px;
`;
