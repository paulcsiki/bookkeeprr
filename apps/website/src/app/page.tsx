import { Topbar } from './components/Topbar';
import { Hero } from './components/Hero';
import { WhatItTracks } from './components/WhatItTracks';
import { HowItWorks } from './components/HowItWorks';
import { LiveDemo } from './components/LiveDemo';
import { DeviceShowcase } from './components/DeviceShowcase';
import { ReadingRoom } from './components/ReadingRoom';
import { FeatureGrid } from './components/FeatureGrid';
import { GetStarted } from './components/GetStarted';
import { Integrations } from './components/Integrations';
import { Faq } from './components/Faq';
import { Cta } from './components/Cta';
import { Footer } from './components/Footer';

export default function Home(): React.JSX.Element {
  return (
    <>
      <Topbar />
      <a id="top"></a>
      <Hero />
      <WhatItTracks />
      <HowItWorks />
      <LiveDemo />
      <DeviceShowcase />
      <ReadingRoom />
      <FeatureGrid />
      <GetStarted />
      <Integrations />
      <Faq />
      <Cta />
      <Footer />
    </>
  );
}
