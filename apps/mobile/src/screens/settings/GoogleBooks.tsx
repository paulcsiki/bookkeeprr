import { ApiKeySettingScreen } from '@/features/settings/ApiKeySettingScreen';

export default function GoogleBooks() {
  return (
    <ApiKeySettingScreen
      title="Google Books"
      description="Works without a key at a low daily quota"
      getPath="/api/settings/googlebooks"
      putPath="/api/settings/googlebooks"
      fieldName="apiKey"
      optional
      testID="screen-googlebooks"
    />
  );
}
