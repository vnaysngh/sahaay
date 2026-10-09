import Foundation

// This file is linked into both native targets. It contains storage/capture only.
enum ShareDraftStore {
 static let group = "group.com.sahaay.app"
 static let maxBytes = 8 * 1024 * 1024
 static func root() throws -> URL {
  guard let container=FileManager.default.containerURL(forSecurityApplicationGroupIdentifier:group) else { throw NSError(domain:"SahaayShare",code:1) }
  var dir=container.appendingPathComponent("ShareDrafts",isDirectory:true)
  try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true,attributes:[.protectionKey:FileProtectionType.complete])
  var values=URLResourceValues();values.isExcludedFromBackup=true;try dir.setResourceValues(values)
  return dir
 }
 static func folder(_ id:String) throws -> URL {
  guard UUID(uuidString:id) != nil else { throw NSError(domain:"SahaayShare",code:2) }
  return try root().appendingPathComponent(id,isDirectory:true)
 }
 static func load(_ url:URL) throws -> [String:Any] {let data=try Data(contentsOf:url.appendingPathComponent("draft.json"));guard data.count<20000,let manifest=try JSONSerialization.jsonObject(with:data) as? [String:Any] else{throw NSError(domain:"SahaayShare",code:3)};return manifest}
 static func write(_ value:[String:Any],to dir:URL) throws {let data=try JSONSerialization.data(withJSONObject:value);try data.write(to:dir.appendingPathComponent("draft.json"),options:[.atomic,.completeFileProtection])}
 static func drafts(owner:String?) throws -> [[String:Any]] {
  let dirs=try FileManager.default.contentsOfDirectory(at:root(),includingPropertiesForKeys:nil)
  var result:[[String:Any]]=[]
  for dir in dirs {
   guard UUID(uuidString:dir.lastPathComponent) != nil else {
    if let attrs=try? FileManager.default.attributesOfItem(atPath:dir.path),let modified=attrs[.modificationDate] as? Date,Date().timeIntervalSince(modified)>86400 {try? FileManager.default.removeItem(at:dir)}
    continue
   }
   guard var draft=try? load(dir),let created=draft["createdAt"] as? Double,Date().timeIntervalSince1970-created<86400 else{try? FileManager.default.removeItem(at:dir);continue}
   if let bound=draft["owner"] as? String,bound != owner {continue}
   let files=draft["files"] as? [[String:String]] ?? []
   draft["files"]=files.compactMap { file -> [String:String]? in guard let name=file["name"],!name.contains("/"),!name.contains("..") else{return nil};return ["uri":dir.appendingPathComponent(name).absoluteString,"filename":name,"mime":file["mime"] ?? "image/jpeg"] }
   result.append(draft)
  }
  return result.sorted{($0["createdAt"] as? Double ?? 0)<($1["createdAt"] as? Double ?? 0)}
 }
 static func setOwner(_ owner:String?) throws {
  let defaults=UserDefaults(suiteName:group)
  let prior=defaults?.string(forKey:"owner")
  if let owner=owner,prior != owner {for dir in try FileManager.default.contentsOfDirectory(at:root(),includingPropertiesForKeys:nil){if let stored=try? load(dir),let bound=stored["owner"] as? String,bound != owner {try? FileManager.default.removeItem(at:dir)}}}
  defaults?.set(owner,forKey:"owner")
 }
}
