Pod::Spec.new do |s|
 s.name = 'SahaayShare'
 s.version = '0.1.0'
 s.summary = 'Sahaay private native share drafts'
 s.description = 'Native lifecycle capture only; all assistant behavior remains on the backend.'
 s.author = 'Sahaay'
 s.homepage = 'https://sahaay.app'
 s.license = { :type => 'MIT' }
 s.platforms = { :ios => '16.4' }
 s.source = { :git => '' }
 s.static_framework = true
 s.dependency 'ExpoModulesCore'
 s.source_files = '**/*.{h,m,mm,swift}'
 s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
