import ExistingLoginPage from "./existing-login";
import { ModernGreenLogin } from "./modern-green-login";
import { getLoginExperience } from "@/lib/login-experience";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const params = await searchParams;
  const experience = await getLoginExperience(params.org);
  if (experience.themeType === "modern-green") {
    return (
      <ModernGreenLogin
        organizationName={experience.organizationName}
        artworkUrl={experience.artworkUrl}
        backgroundArtworkUrl={experience.backgroundArtworkUrl}
        backgroundArtworkVisibility={experience.backgroundArtworkVisibility}
        loginFormTransparent={experience.loginFormTransparent}
      />
    );
  }
  return <ExistingLoginPage />;
}
