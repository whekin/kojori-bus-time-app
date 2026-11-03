Pod::Spec.new do |s|
  s.name = 'KojoriWidget'
  s.version = '1.0.0'
  s.summary = 'Offline favorite transit snapshots for Home Screen widgets'
  s.description = s.summary
  s.author = 'Kojoring Time'
  s.homepage = 'https://github.com/whekin/kojori-bus-time-app'
  s.license = { :type => 'MIT' }
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.0'
  s.frameworks = 'WidgetKit'
end
