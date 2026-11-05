// Development-only visual fixture. Never enabled in a release build.
import {useEffect,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {Fonts,Spacing} from '@/constants/theme';
import {useAppColors} from '@/hooks/use-app-colors';
import {useI18n} from '@/hooks/use-i18n';
import {decodeEtaPreview,selectEtaPreview} from '@/transit/eta-preview';
import {watchDeadline} from '@/transit/deadline';
import {EtaPreviewCard} from './eta-preview-card';
function fixture(){
  const now=Date.now(),boarding={route:{id:'1:R98445',shortName:'316',longName:'Kiketi–Tbilisi',mode:'BUS' as const},pattern:{patternSuffix:'0:01',headsign:'Tbilisi'},stop:{id:'1:3078',label:'Kojori Center'}},scope={routeId:boarding.route.id,pattern:boarding.pattern.patternSuffix,stopId:boarding.stop.id};
  return decodeEtaPreview({version:1,mode:'preview',coverage:'partial',boarding:scope,state:'ready',reason:null,serverTime:now,validUntil:now+25000,predictions:[{...scope,id:'development-eta',vehicleId:'synthetic',source:'gzaap_shadow',arrivalFrom:now+180000,arrivalTo:now+360000,sourceFreshAt:now-30000,generatedAt:now-10000,modelKey:'development-only',catalogKey:'development-only',modelCutoff:now-3600000,sampleJourneys:8,stratum:'day',validUntil:now+25000}]},boarding,now,now);
}
export function EtaPreviewDemo(){
 const colors=useAppColors(),{setLanguage}=useI18n();
 const [data,setData]=useState(fixture);
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer);},[]);
 useEffect(()=>watchDeadline(data.validUntil,setNow),[data.validUntil]);
 return <View style={{flex:1,padding:Spacing.four,paddingTop:Spacing.six,gap:Spacing.three,backgroundColor:colors.bg}}>
  <Text style={{color:colors.warning,fontFamily:Fonts?.mono}}>DEVELOPMENT PREVIEW · SYNTHETIC DATA</Text>
  <View style={{flexDirection:'row',gap:Spacing.three}}>{(['en','ru','ka'] as const).map(language=><Pressable key={language} accessibilityRole="button" onPress={()=>setLanguage(language)} style={{padding:Spacing.two}}><Text style={{color:colors.text}}>{language}</Text></Pressable>)}</View>
  <Pressable testID="refresh-eta-fixture" accessibilityRole="button" onPress={()=>{setData(fixture());setNow(Date.now());}} style={{padding:Spacing.two}}><Text style={{color:colors.text}}>Refresh synthetic estimate</Text></Pressable>
  <EtaPreviewCard enabled predictions={selectEtaPreview(data,false,now)} now={now} loading={false}/>
  <Text style={{color:colors.text,fontFamily:Fonts?.sans}}>TTC departures remain available below the preview in the real app. This fixture makes no network requests.</Text>
 </View>;
}
