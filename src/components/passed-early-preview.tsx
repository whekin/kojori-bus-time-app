// Development-only native visual harness; never shown in release builds.
import {useEffect,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {Fonts,Spacing} from '@/constants/theme';
import {useAppColors} from '@/hooks/use-app-colors';
import {useI18n} from '@/hooks/use-i18n';
import {PassedEarlyCard} from './passed-early-card';
import {watchPassedEarlyExpiry,type PassedEarlyCard as Card} from '@/transit/passed-early';
export function PassedEarlyPreview() {
 const colors=useAppColors(),{setLanguage}=useI18n();
 const [card]=useState<Card>(()=>{const time=Math.ceil((Date.now()+15000)/60000)*60000;return {
  id:'development-preview',boarding:{route:{id:'1:R98445',shortName:'316',longName:'Kiketi–Tbilisi',mode:'BUS'},pattern:{patternSuffix:'0:01',headsign:'Tbilisi'},stop:{id:'1:3078',label:'Kojori Center'}},
  scheduledAt:time,passedFrom:time-11*60000,passedTo:time-9*60000,hideAt:time,timetableSource:'weekly',
 };});
 const [expired,setExpired]=useState(false);
 useEffect(()=>watchPassedEarlyExpiry(card.hideAt,()=>setExpired(true)),[card.hideAt]);
 return <View style={{flex:1,backgroundColor:colors.bg,padding:Spacing.four,paddingTop:Spacing.six,gap:Spacing.three}}>
  <Text style={{color:colors.warning,fontFamily:Fonts?.mono}}>DEVELOPMENT PREVIEW · SYNTHETIC DATA</Text>
  <View style={{flexDirection:'row',gap:Spacing.three}}>{(['en','ru','ka','system'] as const).map(language=><Pressable accessibilityRole="button" key={language} onPress={()=>setLanguage(language)} style={{padding:Spacing.two}}><Text style={{color:colors.text}}>{language}</Text></Pressable>)}</View>
  {expired?<Text accessibilityLabel="Preview expired" style={{color:colors.text}}>Preview expired at the scheduled minute.</Text>:<PassedEarlyCard card={card}/>}
 </View>;
}
