import UIKit
import UniformTypeIdentifiers
import ImageIO

class ShareViewController:UIViewController {
 private let instruction=UITextView()
 private let preview=UILabel()
 private let save=UIButton(type:.system)
 private var providers:[NSItemProvider]=[]
 override func viewDidLoad(){super.viewDidLoad();view.backgroundColor = .systemBackground
  providers=(extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap{$0.attachments ?? []}
  let title=UILabel();title.text="Share to Sahaay";title.font = .preferredFont(forTextStyle:.title2)
  preview.text="\(providers.count) shared item(s). A protected draft will be kept for 24 hours. Open Sahaay to review and send it.";preview.numberOfLines=0
  instruction.font = .preferredFont(forTextStyle:.body);instruction.layer.borderWidth=1;instruction.layer.borderColor=UIColor.separator.cgColor;instruction.layer.cornerRadius=10;instruction.heightAnchor.constraint(equalToConstant:100).isActive=true
  let hint=UILabel();hint.text="What should Sahaay do with this? (optional)";hint.font = .preferredFont(forTextStyle:.subheadline)
  save.setTitle("Keep draft for Sahaay",for:.normal);save.addTarget(self,action:#selector(saveDraft),for:.touchUpInside)
  let cancel=UIButton(type:.system);cancel.setTitle("Cancel",for:.normal);cancel.addTarget(self,action:#selector(cancelShare),for:.touchUpInside)
  let stack=UIStackView(arrangedSubviews:[title,preview,hint,instruction,save,cancel]);stack.axis = .vertical;stack.spacing=18;stack.translatesAutoresizingMaskIntoConstraints=false;view.addSubview(stack);NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo:view.safeAreaLayoutGuide.leadingAnchor,constant:24),stack.trailingAnchor.constraint(equalTo:view.safeAreaLayoutGuide.trailingAnchor,constant:-24),stack.topAnchor.constraint(equalTo:view.safeAreaLayoutGuide.topAnchor,constant:24)])
 }
 @objc private func cancelShare(){extensionContext?.cancelRequest(withError:NSError(domain:"SahaayShareCancelled",code:0))}
 private func load(_ provider:NSItemProvider,_ type:String) async throws -> NSSecureCoding {
  try await withCheckedThrowingContinuation { continuation in provider.loadItem(forTypeIdentifier:type,options:nil){item,error in if let error=error{continuation.resume(throwing:error)}else if let item=item{continuation.resume(returning:item)}else{continuation.resume(throwing:NSError(domain:"SahaayShare",code:5))}}}
 }
 private func loadImage(_ provider:NSItemProvider) async throws -> Data {
  // File representations avoid decoding an unbounded UIImage in the extension.
  try await withCheckedThrowingContinuation { continuation in
   provider.loadFileRepresentation(forTypeIdentifier:UTType.image.identifier){url,error in
    do {
     if let error=error {throw error}
     guard let url=url else {throw NSError(domain:"SahaayShare",code:9)}
     let size=try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0
     guard size>0,size<=ShareDraftStore.maxBytes else {throw NSError(domain:"SahaayShare",code:9)}
     let bytes=try Data(contentsOf:url,options:.mappedIfSafe)
     guard bytes.count<=ShareDraftStore.maxBytes else {throw NSError(domain:"SahaayShare",code:9)}
     continuation.resume(returning:bytes)
    }catch{continuation.resume(throwing:error)}
   }
  }
 }
 @objc private func saveDraft(){save.isEnabled=false;let caption=String(instruction.text.prefix(4000));Task { @MainActor in
  var dir:URL?
  do {
   guard !providers.isEmpty,providers.count<=4 else{throw NSError(domain:"SahaayShare",code:6)}
   _ = try ShareDraftStore.drafts(owner:UserDefaults(suiteName:ShareDraftStore.group)?.string(forKey:"owner"));let existing=try FileManager.default.contentsOfDirectory(at:ShareDraftStore.root(),includingPropertiesForKeys:nil).filter{UUID(uuidString:$0.lastPathComponent) != nil};guard existing.count<10 else{throw NSError(domain:"SahaayShare",code:7)}
   let id=UUID().uuidString;let destination=try ShareDraftStore.folder(id);let folder=try ShareDraftStore.root().appendingPathComponent("."+id+".pending",isDirectory:true);dir=folder;try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true,attributes:[.protectionKey:FileProtectionType.complete])
   var text:[String]=[],files:[[String:String]]=[]
   for provider in providers {
    if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier){
     guard files.count<3 else{throw NSError(domain:"SahaayShare",code:8)}
     let bytes=try await loadImage(provider)
     guard bytes.count<=ShareDraftStore.maxBytes,let source=CGImageSourceCreateWithData(bytes as CFData,nil),let properties=CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString:Any],let width=properties[kCGImagePropertyPixelWidth] as? Int,let height=properties[kCGImagePropertyPixelHeight] as? Int,width>0,height>0,width<=20_000_000/height else{throw NSError(domain:"SahaayShare",code:11)}
     // Preserve supported original bytes; unsupported HEIC is rejected rather than relabelled.
     let mime:String,ext:String
     if bytes.starts(with:[0x89,0x50,0x4e,0x47]){mime="image/png";ext="png"}else if bytes.starts(with:[0xff,0xd8,0xff]){mime="image/jpeg";ext="jpg"}else if bytes.prefix(4)==Data("RIFF".utf8)&&bytes.dropFirst(8).prefix(4)==Data("WEBP".utf8){mime="image/webp";ext="webp"}else{throw NSError(domain:"SahaayShareUnsupported",code:12)}
     let name="image-\(files.count).\(ext)";try bytes.write(to:folder.appendingPathComponent(name),options:[.atomic,.completeFileProtection]);files.append(["name":name,"mime":mime])
    }else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier){let value=try await load(provider,UTType.url.identifier);guard let url=value as? URL,["http","https"].contains(url.scheme?.lowercased() ?? "") else{throw NSError(domain:"SahaayShareUnsupported",code:13)};text.append(url.absoluteString)
    }else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier){let value=try await load(provider,UTType.plainText.identifier);guard let string=value as? String,string.count<=4000 else{throw NSError(domain:"SahaayShare",code:14)};text.append(string)}else{throw NSError(domain:"SahaayShareUnsupported",code:15)}
   }
   let combined=text.joined(separator:"\n");guard combined.count+caption.count<=4000 else{throw NSError(domain:"SahaayShare",code:16)}
   var manifest:[String:Any]=["id":id,"createdAt":Date().timeIntervalSince1970,"text":combined,"instruction":caption,"files":files]
   if let owner=UserDefaults(suiteName:ShareDraftStore.group)?.string(forKey:"owner"){manifest["owner"]=owner}
   try ShareDraftStore.write(manifest,to:folder);try FileManager.default.moveItem(at:folder,to:destination);extensionContext?.completeRequest(returningItems:nil)
  }catch{if let dir=dir{try? FileManager.default.removeItem(at:dir)};preview.text="Unable to keep this share. Use up to 3 PNG/JPEG/WebP images under 8 MB each, or text/HTTP links up to 4,000 characters. Check pending drafts in Sahaay if the queue is full.";save.isEnabled=true}
 }}
}
