import { ApiKeySettingScreen } from '@/features/settings/ApiKeySettingScreen';

export default function ComicVine() {
  return (
    <ApiKeySettingScreen
      title="Metadata (ComicVine)"
      getPath="/api/settings/comicvine"
      putPath="/api/settings/comicvine"
      fieldName="apiKey"
      testPath="/api/comicvine/test-connection"
      testID="screen-comicvine"
    />
  );
}
