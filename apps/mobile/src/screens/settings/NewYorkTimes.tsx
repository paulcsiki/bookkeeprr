import { ApiKeySettingScreen } from '@/features/settings/ApiKeySettingScreen';

export default function NewYorkTimes() {
  return (
    <ApiKeySettingScreen
      title="New York Times"
      getPath="/api/settings/nyt"
      putPath="/api/settings/nyt"
      fieldName="apiKey"
      testPath="/api/settings/nyt/test"
      testID="screen-nyt"
    />
  );
}
