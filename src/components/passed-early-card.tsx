import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {StyleSheet,Text,View} from 'react-native';
import {alpha,Fonts,Spacing} from '@/constants/theme';
import {useAppColors} from '@/hooks/use-app-colors';
import {useTheme} from '@/hooks/use-theme';
import {useI18n} from '@/hooks/use-i18n';
import {transitTime} from '@/transit/model';
import {routeColor} from '@/transit/ui';
import type {PassedEarlyCard as Card} from '@/transit/passed-early';
export function PassedEarlyCard({card}:{card:Card}) {
 const colors=useAppColors(),theme=useTheme(),{t}=useI18n();
 const from=transitTime(card.passedFrom),to=transitTime(card.passedTo),scheduled=transitTime(card.scheduledAt),route=card.boarding.route.shortName;
 return <View testID="passed-early-card" accessible accessibilityRole="alert" accessibilityLabel={t('passedEarlyA11y',{route,from,to,scheduled})}
  style={[styles.card,{backgroundColor:colors.surfaceHigh,borderColor:alpha(colors.warning,'80')}]}>
  <View style={styles.heading}>
   <View style={[styles.badge,{backgroundColor:alpha(routeColor(card.boarding.route.id,colors),'20')}]}><Text style={[styles.route,{color:routeColor(card.boarding.route.id,colors)}]}>{route}</Text></View>
   <Text style={[styles.title,{color:theme.text}]}>{t('passedEarlyTitle')}</Text>
   <MaterialCommunityIcons name="bus-clock" size={Spacing.four} color={colors.warning}/>
  </View>
  <Text style={[styles.interval,{color:theme.text}]}>{t('passedEarlyInterval',{from,to})}</Text>
  <Text style={[styles.schedule,{color:theme.textSecondary}]}>{t(card.timetableSource==='weekly'?'passedEarlyWeeklySchedule':'passedEarlySchedule',{time:scheduled})}</Text>
 </View>;
}
const styles=StyleSheet.create({
 card:{borderWidth:1,borderRadius:Spacing.three,padding:Spacing.three,gap:Spacing.two,marginBottom:Spacing.three},
 heading:{flexDirection:'row',alignItems:'center',gap:Spacing.two},
 badge:{paddingHorizontal:Spacing.two,paddingVertical:Spacing.one,borderRadius:Spacing.two},
 route:{fontFamily:Fonts?.mono,fontSize:Spacing.three,fontWeight:'700'},
 title:{flex:1,fontFamily:Fonts?.sans,fontSize:Spacing.three,fontWeight:'700',lineHeight:Spacing.four},
 interval:{fontFamily:Fonts?.sans,fontSize:Spacing.three,lineHeight:Spacing.four},
 schedule:{fontFamily:Fonts?.sans,fontSize:Spacing.three-Spacing.half,lineHeight:Spacing.four},
});
