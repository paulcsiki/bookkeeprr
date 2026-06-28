import { ApiKeySettingScreen } from '@/features/settings/ApiKeySettingScreen';

export default function MyAnimeList() {
  return (
    <ApiKeySettingScreen
      title="MyAnimeList"
      getPath="/api/settings/mal"
      putPath="/api/settings/mal"
      fieldName="clientId"
      testPath="/api/settings/mal/test"
      testID="screen-mal"
    />
  );
}
