import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { api } from "./auth";
export type DraftMedia = {
  uri: string;
  filename: string;
  kind: "image" | "audio";
};
export async function chooseImage(camera = false): Promise<DraftMedia | null> {
  const permission = camera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      "Allow access in your phone’s settings, or send text instead.",
    );
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 1,
    allowsEditing: false,
  };
  const result = camera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  const image = result.assets?.[0];
  return result.canceled || !image
    ? null
    : {
        uri: image.uri,
        filename: image.fileName ?? "image.jpg",
        kind: "image",
      };
}
export async function uploadMedia(media: DraftMedia, signal?: AbortSignal) {
  const file = new File(media.uri);
  if (file.size > 8388608) throw new Error("Choose a file smaller than 8 MB.");
  return api.upload(await file.bytes(), media.filename, signal);
}
