package com.sahaay.share

import android.content.Intent
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SahaayShareModule: Module() {
 private val context get()=requireNotNull(appContext.reactContext)
 private val prefs get()=context.getSharedPreferences("sahaay-share-owner",0)
 private val root get()=File(context.noBackupFilesDir,"sahaay-shares").apply{mkdirs()}
 private val previews get()=File(context.cacheDir,"sahaay-share-previews").apply{mkdirs()}
 private fun key():SecretKey {val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)};val alias="sahaay-share-drafts";if(!store.containsAlias(alias)){val generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());generator.generateKey()};return store.getKey(alias,null) as SecretKey}
 private fun encrypt(bytes:ByteArray):ByteArray {val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());return c.iv+c.doFinal(bytes)}
 private fun decrypt(bytes:ByteArray):ByteArray {require(bytes.size>=28);val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)));return c.doFinal(bytes.copyOfRange(12,bytes.size))}
 private fun folder(id:String):File {UUID.fromString(id);return File(root,id)}
 private fun read(dir:File)=JSONObject(String(decrypt(File(dir,"draft.enc").readBytes()),Charsets.UTF_8))
 private fun write(dir:File,data:JSONObject){val temp=File(dir,"draft.tmp");temp.writeBytes(encrypt(data.toString().toByteArray()));check(temp.renameTo(File(dir,"draft.enc")))}
 @Synchronized private fun capture(intent:Intent?){
  if(intent==null||intent.action !in listOf(Intent.ACTION_SEND,Intent.ACTION_SEND_MULTIPLE)||intent.getBooleanExtra("sahaay-consumed",false))return
  intent.putExtra("sahaay-consumed",true)
  var dir:File?=null
  try {
   listDrafts(prefs.getString("owner",null));require((root.listFiles()?.size?:0)<10)
   val id=UUID.randomUUID().toString();dir=folder(id).apply{mkdirs()}
   val text=intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?:"";require(text.length<=4000)
   @Suppress("DEPRECATION") val streams=if(intent.action==Intent.ACTION_SEND_MULTIPLE)intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?:arrayListOf() else arrayListOf<Uri>().apply{intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)?.let{add(it)}}
   require(streams.size<=3);val files=JSONArray()
   for((index,uri) in streams.withIndex()){
    require(uri.scheme=="content")
    val mime=context.contentResolver.getType(uri);require(mime in listOf("image/jpeg","image/png","image/webp"))
    val bytes=context.contentResolver.openInputStream(uri)?.use{input->val out=ByteArrayOutputStream();val buffer=ByteArray(8192);while(true){val count=input.read(buffer);if(count<0)break;require(out.size()+count<=8388608);out.write(buffer,0,count)};out.toByteArray()}?:error("Cannot read image")
    require(bytes.isNotEmpty()&&bytes.size<=8388608)
    val name="image-$index.${if(mime=="image/png")"png" else if(mime=="image/webp")"webp" else "jpg"}"
    File(dir,name+".enc").writeBytes(encrypt(bytes));files.put(JSONObject().put("name",name).put("mime",mime))
   }
   require(text.isNotBlank()||files.length()>0)
   val draft=JSONObject().put("id",id).put("createdAt",System.currentTimeMillis()/1000.0).put("text",text).put("instruction","").put("files",files)
   prefs.getString("owner",null)?.let{draft.put("owner",it)};write(dir,draft);sendEvent("draftsChanged",mapOf("ok" to true))
  }catch(e:Exception){dir?.deleteRecursively();sendEvent("draftsChanged",mapOf("error" to "This share could not be kept. Use text or up to three images under 8 MB each."))}
 }
 @Synchronized private fun listDrafts(owner:String?):List<Map<String,Any?>> {
  val result=mutableListOf<Map<String,Any?>>()
  for(dir in root.listFiles()?:emptyArray())try{
   val draft=read(dir)
   if(System.currentTimeMillis()/1000.0-draft.getDouble("createdAt")>=86400){dir.deleteRecursively();continue}
   if(draft.has("owner")&&draft.getString("owner")!=owner)continue
   val files=draft.getJSONArray("files");val out=mutableListOf<Map<String,String>>()
   for(i in 0 until files.length()){val f=files.getJSONObject(i);val name=f.getString("name");require(!name.contains('/')&&!name.contains(".."));val preview=File(previews,"${draft.getString("id")}-$name");preview.writeBytes(decrypt(File(dir,name+".enc").readBytes()));out.add(mapOf("uri" to Uri.fromFile(preview).toString(),"filename" to name,"mime" to f.getString("mime")))}
   result.add(mapOf("id" to draft.getString("id"),"createdAt" to draft.getDouble("createdAt"),"owner" to if(draft.has("owner"))draft.getString("owner") else null,"text" to draft.getString("text"),"instruction" to draft.getString("instruction"),"conversationId" to if(draft.has("conversationId"))draft.getString("conversationId") else null,"files" to out))
  }catch(e:Exception){dir.deleteRecursively()}
  return result.sortedBy{it["createdAt"] as Double}
 }
 override fun definition()=ModuleDefinition {
  Name("SahaayShare");Events("draftsChanged")
  OnNewIntent{intent->capture(intent)}
  OnActivityEntersForeground{capture(appContext.currentActivity?.intent);sendEvent("draftsChanged",emptyMap<String,String>())}
  OnActivityEntersBackground{previews.listFiles()?.forEach{it.delete()}}
  AsyncFunction("setOwner"){owner:String?->synchronized(this@SahaayShareModule){for(dir in root.listFiles()?:emptyArray())try{val d=read(dir);if(owner!=null&&d.has("owner")&&d.getString("owner")!=owner)dir.deleteRecursively()}catch(e:Exception){dir.deleteRecursively()};previews.listFiles()?.forEach{it.delete()};prefs.edit().putString("owner",owner).commit()}}
  AsyncFunction("list"){owner:String?->capture(appContext.currentActivity?.intent);listDrafts(owner)}
  AsyncFunction("claim"){id:String,owner:String->synchronized(this@SahaayShareModule){val dir=folder(id);val d=read(dir);require(!d.has("owner")||d.getString("owner")==owner);d.put("owner",owner);write(dir,d)}}
  AsyncFunction("markSubmitted"){id:String,owner:String,conversationId:String->synchronized(this@SahaayShareModule){UUID.fromString(conversationId);val dir=folder(id);val d=read(dir);require(d.getString("owner")==owner);require(!d.has("conversationId")||d.getString("conversationId")==conversationId);d.put("conversationId",conversationId);write(dir,d)}}
  AsyncFunction("remove"){id:String,owner:String->synchronized(this@SahaayShareModule){val dir=folder(id);val d=read(dir);require(!d.has("owner")||d.getString("owner")==owner);dir.deleteRecursively();previews.listFiles()?.filter{it.name.startsWith(id+"-")}?.forEach{it.delete()}}}
 }
}
