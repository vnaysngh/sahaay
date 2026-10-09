import ExpoModulesCore

public class SahaayShareModule: Module {
 public func definition() -> ModuleDefinition {
  Name("SahaayShare")
  Events("draftsChanged")
  OnAppEntersForeground { self.sendEvent("draftsChanged",[:]) }
  AsyncFunction("setOwner") { (owner:String?) in try ShareDraftStore.setOwner(owner) }
  AsyncFunction("list") { (owner:String?) in try ShareDraftStore.drafts(owner:owner) }
  AsyncFunction("claim") { (id:String,owner:String) in
   let folder=try ShareDraftStore.folder(id);var draft=try ShareDraftStore.load(folder)
   if let bound=draft["owner"] as? String,bound != owner {throw NSError(domain:"SahaayShare",code:4)}
   draft["owner"]=owner;try ShareDraftStore.write(draft,to:folder)
  }
  AsyncFunction("markSubmitted") { (id:String,owner:String,conversationId:String) in
   guard UUID(uuidString:conversationId) != nil else {throw NSError(domain:"SahaayShare",code:2)}
   let folder=try ShareDraftStore.folder(id);var draft=try ShareDraftStore.load(folder)
   guard draft["owner"] as? String == owner else {throw NSError(domain:"SahaayShare",code:4)}
   if let existing=draft["conversationId"] as? String,existing != conversationId {throw NSError(domain:"SahaayShare",code:5)}
   draft["conversationId"]=conversationId;try ShareDraftStore.write(draft,to:folder)
  }
  AsyncFunction("remove") { (id:String,owner:String) in
   let folder=try ShareDraftStore.folder(id);let draft=try ShareDraftStore.load(folder)
   if let bound=draft["owner"] as? String,bound != owner {throw NSError(domain:"SahaayShare",code:4)}
   try FileManager.default.removeItem(at:folder)
  }
 }
}
